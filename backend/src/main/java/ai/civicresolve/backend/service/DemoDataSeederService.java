package ai.civicresolve.backend.service;

import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import ai.civicresolve.backend.entity.Prediction;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.GrievanceTrackingCredentialRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Service to seed realistic operational telemetry and demo complaints
 * across all 8 CFPB product categories, priorities, and workflow statuses.
 */
@Service
public class DemoDataSeederService {

    private static final Logger log = LoggerFactory.getLogger(DemoDataSeederService.class);

    private final GrievanceRepository grievanceRepository;
    private final PredictionRepository predictionRepository;
    private final AuditLogRepository auditLogRepository;
    private final GrievanceTrackingCredentialRepository trackingCredentialRepository;
    private final TrackingCryptoService trackingCryptoService;

    private static final String MODEL_USED = "baseline_tfidf_logreg";
    private static final String MODEL_VERSION = "7a9964e0ef15514dfe3a561977b7da7826209042799a6ca2a11b7f04d9c80bc0";

    public DemoDataSeederService(GrievanceRepository grievanceRepository,
                                 PredictionRepository predictionRepository,
                                 AuditLogRepository auditLogRepository,
                                 GrievanceTrackingCredentialRepository trackingCredentialRepository,
                                 TrackingCryptoService trackingCryptoService) {
        this.grievanceRepository = grievanceRepository;
        this.predictionRepository = predictionRepository;
        this.auditLogRepository = auditLogRepository;
        this.trackingCredentialRepository = trackingCredentialRepository;
        this.trackingCryptoService = trackingCryptoService;
    }

    private record SeedTemplate(
            String category,
            String narrative,
            TriagePriority priority,
            GrievanceStatus status,
            double confidence,
            double margin,
            boolean flagForReview,
            String predictedCategory,
            Double sentimentScore,
            String sentimentLabel,
            int daysAgo,
            int hoursAgo
    ) {}

    @Transactional
    public int seedRealisticDemoTelemetry() {
        log.info("Seeding realistic CFPB demo grievance telemetry...");
        List<SeedTemplate> templates = getSeedTemplates();
        Instant now = Instant.now();
        int createdCount = 0;

        for (SeedTemplate t : templates) {
            Instant submittedAt = now.minus(Duration.ofDays(t.daysAgo())).minus(Duration.ofHours(t.hoursAgo()));
            
            // 1. Create and save Grievance
            Grievance grievance = new Grievance(
                    t.narrative(),
                    t.category(),
                    t.priority(),
                    t.status(),
                    t.flagForReview()
            );
            grievance.setSubmittedAt(submittedAt);
            grievance.setUpdatedAt(t.status() == GrievanceStatus.PENDING_REVIEW ? submittedAt : submittedAt.plus(Duration.ofHours(2)));
            grievance = grievanceRepository.save(grievance);

            // 2. Probabilities map
            Map<String, Double> probs = new LinkedHashMap<>();
            probs.put(t.predictedCategory(), t.confidence());
            probs.put(t.category(), Math.max(0.02, t.confidence() - t.margin()));

            // 3. Explanation
            NlpExplanation explanation = new NlpExplanation(
                    "linear_feature_attribution",
                    "1.0.0",
                    t.predictedCategory(),
                    t.category().equals(t.predictedCategory()) ? "Debt collection" : t.category(),
                    4.2,
                    2.1,
                    t.margin(),
                    -0.5,
                    4.7,
                    -0.8,
                    2.9,
                    0.3,
                    1.8,
                    12,
                    List.of(
                            new NlpExplanation.FeatureContributionItem("unauthorized", 1.45),
                            new NlpExplanation.FeatureContributionItem("dispute", 1.12),
                            new NlpExplanation.FeatureContributionItem("account", 0.88)
                    ),
                    List.of(
                            new NlpExplanation.FeatureContributionItem("inquiry", -0.32)
                    ),
                    List.of(),
                    List.of(),
                    MODEL_VERSION,
                    "Uncalibrated model probability estimates; heuristic assistance only."
            );

            // 4. Prediction
            Prediction prediction = new Prediction(
                    grievance,
                    t.predictedCategory(),
                    MODEL_USED,
                    MODEL_VERSION,
                    t.confidence(),
                    t.margin(),
                    probs,
                    t.flagForReview(),
                    t.flagForReview() ? List.of("Automated triage trigger", "Confidence margin inspection required") : List.of(),
                    t.priority().name(),
                    t.priority() == TriagePriority.CRITICAL ? List.of("Critical risk threshold policy") : List.of(),
                    t.sentimentScore(),
                    t.sentimentLabel(),
                    explanation
            );
            prediction.setPredictedAt(submittedAt.plusMillis(120));
            predictionRepository.save(prediction);

            // 5. Audit Log (submission)
            AuditLog submitAudit = AuditLog.builder(grievance, "SYSTEM", "SUBMIT")
                    .newStatus(t.status())
                    .newCategory(t.predictedCategory())
                    .newPriority(t.priority().name())
                    .createdAt(submittedAt.plusMillis(150))
                    .build();
            auditLogRepository.save(submitAudit);

            // If reviewed (APPROVED or OVERRIDDEN)
            if (t.status() == GrievanceStatus.APPROVED) {
                AuditLog reviewAudit = AuditLog.builder(grievance, "reviewer", "APPROVE")
                        .previousStatus(GrievanceStatus.PENDING_REVIEW)
                        .newStatus(GrievanceStatus.APPROVED)
                        .previousCategory(t.predictedCategory())
                        .newCategory(t.category())
                        .previousPriority(t.priority().name())
                        .newPriority(t.priority().name())
                        .reviewNote("AI preliminary assessment verified against submitted documentation.")
                        .createdAt(submittedAt.plus(Duration.ofHours(2)))
                        .build();
                auditLogRepository.save(reviewAudit);
            } else if (t.status() == GrievanceStatus.OVERRIDDEN) {
                AuditLog reviewAudit = AuditLog.builder(grievance, "reviewer", "OVERRIDE")
                        .previousStatus(GrievanceStatus.PENDING_REVIEW)
                        .newStatus(GrievanceStatus.OVERRIDDEN)
                        .previousCategory(t.predictedCategory())
                        .newCategory(t.category())
                        .previousPriority(t.priority() == TriagePriority.HIGH ? TriagePriority.MEDIUM.name() : t.priority().name())
                        .newPriority(t.priority().name())
                        .reviewNote("Narrative context indicates specialized handling under revised category.")
                        .createdAt(submittedAt.plus(Duration.ofHours(2)))
                        .build();
                auditLogRepository.save(reviewAudit);
            }

            // 6. Tracking credential
            TrackingCryptoService.GeneratedCredential credential = trackingCryptoService.generateCredential();
            GrievanceTrackingCredential cred = new GrievanceTrackingCredential(
                    grievance.getId(),
                    credential.secretHash(),
                    credential.salt()
            );
            cred.setCreatedAt(submittedAt);
            trackingCredentialRepository.save(cred);

            createdCount++;
        }

        log.info("Successfully seeded {} realistic CFPB complaints across all 8 categories.", createdCount);
        return createdCount;
    }

    private List<SeedTemplate> getSeedTemplates() {
        List<SeedTemplate> list = new ArrayList<>();

        // Credit reporting (4 cases)
        list.add(new SeedTemplate(
                "Credit reporting or other personal consumer reports",
                "I discovered an unauthorized hard inquiry on my credit report from a lender I have never had any relationship with. I sent two dispute letters demanding removal under the FCRA, but the bureau failed to investigate within 30 days.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.92, 0.45, false,
                "Credit reporting or other personal consumer reports", -0.65, "NEGATIVE", 13, 4
        ));
        list.add(new SeedTemplate(
                "Credit reporting or other personal consumer reports",
                "My credit file contains an erroneous public record judgment belonging to someone with a similar name in another state. This has dropped my credit score by 85 points and prevented mortgage refinancing.",
                TriagePriority.CRITICAL, GrievanceStatus.PENDING_REVIEW, 0.78, 0.18, true,
                "Credit reporting or other personal consumer reports", -0.82, "NEGATIVE", 2, 6
        ));
        list.add(new SeedTemplate(
                "Credit reporting or other personal consumer reports",
                "The bureau verified an account that was settled in full three years ago as an active open collection. Please correct the reporting status immediately.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.89, 0.52, false,
                "Credit reporting or other personal consumer reports", -0.42, "NEGATIVE", 9, 1
        ));
        list.add(new SeedTemplate(
                "Credit reporting or other personal consumer reports",
                "I was a victim of identity theft and placed a formal fraud alert and FTC identity theft report. Yet new accounts were still opened without contacting me.",
                TriagePriority.CRITICAL, GrievanceStatus.OVERRIDDEN, 0.62, 0.08, true,
                "Debt collection", -0.91, "NEGATIVE", 5, 8
        ));

        // Debt collection (4 cases)
        list.add(new SeedTemplate(
                "Debt collection",
                "A debt collection agency has been repeatedly calling my workplace after I explicitly notified them in writing that my employer does not allow personal phone calls. They threatened wage garnishment without a court judgment.",
                TriagePriority.CRITICAL, GrievanceStatus.APPROVED, 0.88, 0.42, true,
                "Debt collection", -0.78, "NEGATIVE", 11, 2
        ));
        list.add(new SeedTemplate(
                "Debt collection",
                "Collector is seeking repayment for an ancient medical bill from 2014 which is well past the state statute of limitations. They refuse to send verification of debt.",
                TriagePriority.HIGH, GrievanceStatus.PENDING_REVIEW, 0.74, 0.22, true,
                "Debt collection", -0.55, "NEGATIVE", 1, 14
        ));
        list.add(new SeedTemplate(
                "Debt collection",
                "Collection notice received for a utility account at an address where I have never lived. I requested debt validation 45 days ago and received nothing.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.86, 0.48, false,
                "Debt collection", -0.38, "NEGATIVE", 8, 3
        ));
        list.add(new SeedTemplate(
                "Debt collection",
                "Collector deducted money from my checking account without prior authorization following a disputable phone settlement agreement.",
                TriagePriority.HIGH, GrievanceStatus.OVERRIDDEN, 0.53, 0.06, true,
                "Checking or savings account", -0.84, "NEGATIVE", 4, 11
        ));

        // Credit card (4 cases)
        list.add(new SeedTemplate(
                "Credit card",
                "My credit card statement includes $1,420 in unauthorized international transaction charges while I was hospitalized. The bank denied my dispute claim without providing documentation.",
                TriagePriority.CRITICAL, GrievanceStatus.PENDING_REVIEW, 0.91, 0.65, true,
                "Credit card", -0.89, "NEGATIVE", 0, 5
        ));
        list.add(new SeedTemplate(
                "Credit card",
                "Card issuer abruptly increased my APR from 14.99% to 29.99% without the mandatory 45-day written notice required under CARD Act regulations.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.85, 0.38, false,
                "Credit card", -0.61, "NEGATIVE", 12, 10
        ));
        list.add(new SeedTemplate(
                "Credit card",
                "Merchandise returned to seller within 14 days, return receipt confirmed, yet credit card merchant refused to post refund credit and charged late fees on the disputed balance.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.87, 0.44, false,
                "Credit card", -0.45, "NEGATIVE", 6, 7
        ));
        list.add(new SeedTemplate(
                "Credit card",
                "Payment was initiated through external bank bill pay 5 business days prior to due date but posted 2 days late by card issuer resulting in a $39 fee.",
                TriagePriority.LOW, GrievanceStatus.APPROVED, 0.79, 0.26, false,
                "Credit card", -0.22, "NEUTRAL", 10, 16
        ));

        // Checking or savings account (4 cases)
        list.add(new SeedTemplate(
                "Checking or savings account",
                "The bank placed a freeze on my primary checking account following a direct deposit transfer. Customer service has held my paycheck for 10 days with no explanation or resolution timeline.",
                TriagePriority.CRITICAL, GrievanceStatus.PENDING_REVIEW, 0.84, 0.31, true,
                "Checking or savings account", -0.87, "NEGATIVE", 1, 2
        ));
        list.add(new SeedTemplate(
                "Checking or savings account",
                "An ATM machine debited $400 from my checking account but failed to dispense cash due to a mechanical jam. The branch filed an investigation but has not credited my account after 20 days.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.90, 0.54, false,
                "Checking or savings account", -0.73, "NEGATIVE", 7, 9
        ));
        list.add(new SeedTemplate(
                "Checking or savings account",
                "Multiple recurring overdraft fees assessed sequentially in a single day due to reordering transactions from highest to lowest dollar amount.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.88, 0.49, false,
                "Checking or savings account", -0.58, "NEGATIVE", 14, 1
        ));
        list.add(new SeedTemplate(
                "Checking or savings account",
                "Wire transfer sent from my savings account to a domestic title company failed to clear after 72 hours, delaying my real estate settlement.",
                TriagePriority.HIGH, GrievanceStatus.OVERRIDDEN, 0.58, 0.11, true,
                "Money transfer, virtual currency, or money service", -0.68, "NEGATIVE", 3, 15
        ));

        // Money transfer / virtual currency (4 cases)
        list.add(new SeedTemplate(
                "Money transfer, virtual currency, or money service",
                "International remittance sent to support family overseas was debited from my debit card but never deposited into recipient bank account. Provider support is unresponsive.",
                TriagePriority.HIGH, GrievanceStatus.PENDING_REVIEW, 0.86, 0.39, true,
                "Money transfer, virtual currency, or money service", -0.71, "NEGATIVE", 2, 19
        ));
        list.add(new SeedTemplate(
                "Money transfer, virtual currency, or money service",
                "Crypto exchange platform locked withdrawal capabilities for 3 weeks citing routine compliance review, causing substantial losses during market fluctuations.",
                TriagePriority.CRITICAL, GrievanceStatus.APPROVED, 0.82, 0.28, true,
                "Money transfer, virtual currency, or money service", -0.79, "NEGATIVE", 6, 12
        ));
        list.add(new SeedTemplate(
                "Money transfer, virtual currency, or money service",
                "Purchased a $1,000 cashier's money order which was lost in certified mail. The issuing agent stated a stop-payment refund requires an unreasonable 90-day waiting period.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.84, 0.41, false,
                "Money transfer, virtual currency, or money service", -0.49, "NEGATIVE", 11, 8
        ));
        list.add(new SeedTemplate(
                "Money transfer, virtual currency, or money service",
                "Peer-to-peer payment app debited duplicate $250 charges for a single restaurant split transaction.",
                TriagePriority.LOW, GrievanceStatus.APPROVED, 0.77, 0.24, false,
                "Money transfer, virtual currency, or money service", -0.31, "NEUTRAL", 9, 21
        ));

        // Mortgage (4 cases)
        list.add(new SeedTemplate(
                "Mortgage",
                "My mortgage servicer failed to pay property taxes from my escrow account despite sufficient balance, resulting in county tax lien penalties assessed against my home.",
                TriagePriority.CRITICAL, GrievanceStatus.APPROVED, 0.93, 0.61, true,
                "Mortgage", -0.85, "NEGATIVE", 10, 5
        ));
        list.add(new SeedTemplate(
                "Mortgage",
                "The servicer sent a foreclosure notice while our complete loss mitigation assistance package was under active review, violating CFPB dual-tracking rules.",
                TriagePriority.CRITICAL, GrievanceStatus.PENDING_REVIEW, 0.94, 0.67, true,
                "Mortgage", -0.92, "NEGATIVE", 0, 18
        ));
        list.add(new SeedTemplate(
                "Mortgage",
                "Requested an official loan payoff quote for closing on a home sale; servicer took 14 business days rather than the required 7 business days, causing buyer rate lock expiration.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.88, 0.44, false,
                "Mortgage", -0.64, "NEGATIVE", 5, 3
        ));
        list.add(new SeedTemplate(
                "Mortgage",
                "Private mortgage insurance (PMI) cancellation request submitted after achieving 80% LTV based on verified appraisal; servicer has ignored correspondence for 60 days.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.86, 0.49, false,
                "Mortgage", -0.41, "NEGATIVE", 13, 14
        ));

        // Student loan (4 cases)
        list.add(new SeedTemplate(
                "Student loan",
                "My loan servicer miscalculated qualifying payment counts under Public Service Loan Forgiveness (PSLF). Over 36 certified on-time monthly payments were categorized as ineligible.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.89, 0.52, true,
                "Student loan", -0.72, "NEGATIVE", 8, 11
        ));
        list.add(new SeedTemplate(
                "Student loan",
                "Servicer transferred loan portfolio to a new entity and failed to transfer automated ACH debit records, erroneously reporting late payments to credit reporting agencies.",
                TriagePriority.HIGH, GrievanceStatus.OVERRIDDEN, 0.61, 0.09, true,
                "Credit reporting or other personal consumer reports", -0.80, "NEGATIVE", 4, 17
        ));
        list.add(new SeedTemplate(
                "Student loan",
                "Submitted Income-Driven Repayment (IDR) annual recertification documentation 60 days before deadline; servicer placed loan in administrative forbearance capitalizing accrued interest.",
                TriagePriority.MEDIUM, GrievanceStatus.PENDING_REVIEW, 0.83, 0.36, true,
                "Student loan", -0.56, "NEGATIVE", 2, 22
        ));
        list.add(new SeedTemplate(
                "Student loan",
                "Excess monthly payment allocated across all loan groups instead of targeted highest interest rate unsubsidized loans despite written standing instructions.",
                TriagePriority.LOW, GrievanceStatus.AUTO_ROUTED, 0.84, 0.43, false,
                "Student loan", -0.25, "NEUTRAL", 12, 19
        ));

        // Vehicle loan or lease (4 cases)
        list.add(new SeedTemplate(
                "Vehicle loan or lease",
                "Auto finance company dispatched a repossession tow truck despite all monthly payments being current and verified via bank statements. Repossession fees charged improperly.",
                TriagePriority.CRITICAL, GrievanceStatus.PENDING_REVIEW, 0.87, 0.48, true,
                "Vehicle loan or lease", -0.93, "NEGATIVE", 0, 9
        ));
        list.add(new SeedTemplate(
                "Vehicle loan or lease",
                "Paid off auto loan in full three months ago; lender has failed to release the vehicle lien and mail clean title, preventing vehicle sale to private buyer.",
                TriagePriority.HIGH, GrievanceStatus.APPROVED, 0.89, 0.55, false,
                "Vehicle loan or lease", -0.66, "NEGATIVE", 7, 16
        ));
        list.add(new SeedTemplate(
                "Vehicle loan or lease",
                "Total loss insurance settlement check received by auto lender. Lender delayed processing gap insurance coverage refund for over 90 days while charging interest.",
                TriagePriority.MEDIUM, GrievanceStatus.OVERRIDDEN, 0.56, 0.07, true,
                "Credit card", -0.58, "NEGATIVE", 5, 20
        ));
        list.add(new SeedTemplate(
                "Vehicle loan or lease",
                "Returned leased car in pristine condition with documented inspection report; received surprise disposition bill for $1,250 claiming non-existent excess wear and tear.",
                TriagePriority.MEDIUM, GrievanceStatus.AUTO_ROUTED, 0.85, 0.46, false,
                "Vehicle loan or lease", -0.47, "NEGATIVE", 14, 6
        ));

        return list;
    }
}
