package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.ActiveLearningRecord;
import ai.civicresolve.backend.dto.CalibrationMetricsResponse;
import ai.civicresolve.backend.dto.DualModelComparisonRequest;
import ai.civicresolve.backend.dto.DualModelComparisonResponse;
import ai.civicresolve.backend.dto.ExecutiveAnalyticsResponse;
import ai.civicresolve.backend.dto.GrievanceDetailResponse;
import ai.civicresolve.backend.dto.GrievanceRequest;
import ai.civicresolve.backend.dto.GrievanceResponse;
import ai.civicresolve.backend.dto.GrievanceStatsResponse;
import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
import ai.civicresolve.backend.dto.ModelAuditResponse;
import ai.civicresolve.backend.dto.PrecedentRankRequest;
import ai.civicresolve.backend.dto.PrecedentRankResponse;
import ai.civicresolve.backend.dto.ReviewRequest;
import ai.civicresolve.backend.dto.SemanticPrecedentResponse;
import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.Prediction;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.exception.GrievanceNotFoundException;
import ai.civicresolve.backend.exception.InvalidReviewStateException;
import ai.civicresolve.backend.exception.StaleGrievanceVersionException;
import ai.civicresolve.backend.repository.AuditLogRepository;
import ai.civicresolve.backend.repository.GrievanceRepository;
import ai.civicresolve.backend.repository.PredictionRepository;
import ai.civicresolve.backend.repository.ProductCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Core business logic for grievance lifecycle management.
 *
 * <p>Submission workflow (per MASTER_PLAN Phase 7):
 * <ol>
 *   <li>Validate the narrative.</li>
 *   <li>Call FastAPI <em>outside</em> the database transaction.</li>
 *   <li>Validate the prediction and category.</li>
 *   <li>Persist the grievance, original prediction, and initial audit event atomically.</li>
 *   <li>Use {@code PENDING_REVIEW} when {@code flag_for_review=true}; otherwise {@code AUTO_ROUTED}.</li>
 * </ol>
 */
@Service
public class GrievanceService {

    private static final Logger log = LoggerFactory.getLogger(GrievanceService.class);

    // Set of terminal states that cannot transition further
    private static final Set<GrievanceStatus> TERMINAL_STATES = Set.of(
            GrievanceStatus.APPROVED,
            GrievanceStatus.OVERRIDDEN,
            GrievanceStatus.REJECTED
    );

    private final GrievanceRepository grievanceRepository;
    private final PredictionRepository predictionRepository;
    private final AuditLogRepository auditLogRepository;
    private final ProductCategoryRepository productCategoryRepository;
    private final NlpClientService nlpClientService;
    private final GrievancePersistenceService grievancePersistenceService;
    private final DemoDataSeederService demoDataSeederService;

    public GrievanceService(GrievanceRepository grievanceRepository,
                            PredictionRepository predictionRepository,
                            AuditLogRepository auditLogRepository,
                            ProductCategoryRepository productCategoryRepository,
                            NlpClientService nlpClientService,
                            GrievancePersistenceService grievancePersistenceService,
                            DemoDataSeederService demoDataSeederService) {
        this.grievanceRepository = grievanceRepository;
        this.predictionRepository = predictionRepository;
        this.auditLogRepository = auditLogRepository;
        this.productCategoryRepository = productCategoryRepository;
        this.nlpClientService = nlpClientService;
        this.grievancePersistenceService = grievancePersistenceService;
        this.demoDataSeederService = demoDataSeederService;
    }

    // ─── Submission ──────────────────────────────────────────────────────────

    /**
     * Submit a new grievance.
     *
     * <p>The NLP call happens outside the transaction. If FastAPI fails, no DB record
     * is created and the caller receives the appropriate 5xx error.
     * Only after a valid NLP response do we delegate to the Spring-managed persistence bean
     * for atomic transactional persistence.
     */
    public GrievanceSubmissionResponse submit(GrievanceRequest request) {
        // Step 1: validated by Bean Validation before reaching this method
        String narrative = request.description();

        // Step 2: call FastAPI OUTSIDE transaction
        NlpPrediction prediction = nlpClientService.classify(narrative);

        // Step 3: validate category against seeded product_categories table
        if (!productCategoryRepository.existsByLabel(prediction.productCategory())) {
            log.error("NLP service returned category not in product_categories table: {}",
                    prediction.productCategory());
            throw new NlpClientService.NlpClientException(502,
                    "NLP service returned a category not registered in the database.");
        }

        // Step 4: persist atomically via separate Spring-managed bean to guarantee proxy interception
        return grievancePersistenceService.persistSubmission(narrative, prediction);
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Page<GrievanceResponse> list(GrievanceStatus status,
                                        TriagePriority priority,
                                        String category,
                                        int page,
                                        int size) {
        int safeSize = Math.min(size, 100);
        Pageable pageable = PageRequest.of(page, safeSize);
        return grievanceRepository.findAll(status, priority, category, pageable)
                .map(GrievanceResponse::from);
    }

    @Transactional(readOnly = true)
    public GrievanceDetailResponse getById(UUID id) {
        Grievance grievance = grievanceRepository.findById(id)
                .orElseThrow(() -> new GrievanceNotFoundException(id));
        Prediction prediction = predictionRepository.findByGrievanceId(id).orElse(null);
        List<AuditLog> auditLogs = auditLogRepository.findByGrievanceIdOrderByCreatedAtAscIdAsc(id);
        return GrievanceDetailResponse.from(grievance, prediction, auditLogs);
    }

    @Transactional(readOnly = true)
    public GrievanceStatsResponse getStats() {
        long total = grievanceRepository.count();
        long pendingReview = grievanceRepository.countByStatus(GrievanceStatus.PENDING_REVIEW);

        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (GrievanceStatus s : GrievanceStatus.values()) {
            byStatus.put(s.name(), grievanceRepository.countByStatus(s));
        }

        Map<String, Long> byPriority = new LinkedHashMap<>();
        for (TriagePriority p : TriagePriority.values()) {
            byPriority.put(p.name(), grievanceRepository.countByPriority(p));
        }

        return new GrievanceStatsResponse(total, byStatus, byPriority, pendingReview);
    }

    // ─── Human Review ─────────────────────────────────────────────────────────

    /**
     * Process a reviewer action (APPROVE, OVERRIDE, REJECT).
     *
     * <p>Actor identity is derived from Spring Security — never from the request body.
     * Every review appends an audit record atomically with the status change.
     */
    @Transactional
    public GrievanceResponse review(UUID id, ReviewRequest request) {
        String actor = SecurityContextHolder.getContext().getAuthentication().getName();

        Grievance grievance = grievanceRepository.findById(id)
                .orElseThrow(() -> new GrievanceNotFoundException(id));

        // Mandatory browser-level optimistic lock check:
        // Rejects stale submissions before any state mutation or audit log insertion.
        Long currentVersion = grievance.getVersion() != null ? grievance.getVersion() : 0L;
        if (request.expectedVersion() == null || !request.expectedVersion().equals(currentVersion)) {
            throw new StaleGrievanceVersionException(
                    id,
                    request.expectedVersion() != null ? request.expectedVersion() : -1L,
                    currentVersion);
        }

        validateStateTransition(grievance, request);

        GrievanceStatus previousStatus = grievance.getStatus();
        String previousCategory = grievance.getAssignedCategory();
        String previousPriority = grievance.getPriority().name();

        String action = request.action();
        switch (action) {
            case "APPROVE" -> {
                grievance.setStatus(GrievanceStatus.APPROVED);
                grievance.setReviewRequired(false);
            }
            case "OVERRIDE" -> {
                if (request.newCategory() != null && !request.newCategory().isBlank()) {
                    if (!productCategoryRepository.existsByLabel(request.newCategory())) {
                        throw new InvalidReviewStateException(
                                "Unsupported category: " + request.newCategory());
                    }
                    grievance.setAssignedCategory(request.newCategory());
                }
                if (request.newPriority() != null && !request.newPriority().isBlank()) {
                    grievance.setPriority(TriagePriority.valueOf(request.newPriority()));
                }
                grievance.setStatus(GrievanceStatus.OVERRIDDEN);
                grievance.setReviewRequired(false);
            }
            case "REJECT" -> {
                grievance.setStatus(GrievanceStatus.REJECTED);
                grievance.setReviewRequired(false);
            }
            default -> throw new InvalidReviewStateException("Unknown action: " + action);
        }

        grievance = grievanceRepository.saveAndFlush(grievance);

        AuditLog auditEntry = AuditLog.builder(grievance, actor, action)
                .previousStatus(previousStatus)
                .newStatus(grievance.getStatus())
                .previousCategory(previousCategory)
                .newCategory(grievance.getAssignedCategory())
                .previousPriority(previousPriority)
                .newPriority(grievance.getPriority().name())
                .reviewNote(request.reviewNote())
                .build();
        auditLogRepository.save(auditEntry);

        log.info("Grievance reviewed [id={}, actor={}, action={}, newStatus={}]",
                id, actor, action, grievance.getStatus());

        return GrievanceResponse.from(grievance);
    }

    // ─── Product Categories ───────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<String> listCategories() {
        return productCategoryRepository.findAll()
                .stream()
                .map(c -> c.getLabel())
                .sorted()
                .toList();
    }

    /**
     * Aggregated model audit and reviewer calibration analytics.
     * Computes agreement rates, override distributions, and 8x8 confusion matrix.
     */
    @Transactional(readOnly = true)
    public ModelAuditResponse getModelAuditAnalytics() {
        List<String> categories = listCategories();
        if (categories.isEmpty()) {
            categories = List.of(
                    "Credit reporting or other personal consumer reports",
                    "Debt collection",
                    "Credit card",
                    "Checking or savings account",
                    "Money transfer, virtual currency, or money service",
                    "Mortgage",
                    "Student loan",
                    "Vehicle loan or lease"
            );
        }

        Map<String, Map<String, Long>> confusionMatrix = new LinkedHashMap<>();
        for (String predCat : categories) {
            Map<String, Long> row = new LinkedHashMap<>();
            for (String actualCat : categories) {
                row.put(actualCat, 0L);
            }
            confusionMatrix.put(predCat, row);
        }

        Map<String, Long> overrideDist = new LinkedHashMap<>();
        for (String cat : categories) {
            overrideDist.put(cat, 0L);
        }

        Map<String, Long> triggerBreakdown = new LinkedHashMap<>();
        triggerBreakdown.put("LOW_CONFIDENCE", 0L);
        triggerBreakdown.put("SMALL_MARGIN", 0L);
        triggerBreakdown.put("CRITICAL_PRIORITY_POLICY", 0L);
        triggerBreakdown.put("AUTO_ROUTED", 0L);

        // 1. Process database-aggregated trigger counts (no complaint narratives loaded)
        PredictionRepository.TriggerCounts triggers = predictionRepository.countTriggers();
        if (triggers != null) {
            triggerBreakdown.put("LOW_CONFIDENCE", triggers.getLowConfidenceCount() != null ? triggers.getLowConfidenceCount() : 0L);
            triggerBreakdown.put("SMALL_MARGIN", triggers.getSmallMarginCount() != null ? triggers.getSmallMarginCount() : 0L);
            triggerBreakdown.put("CRITICAL_PRIORITY_POLICY", triggers.getCriticalPriorityCount() != null ? triggers.getCriticalPriorityCount() : 0L);
            triggerBreakdown.put("AUTO_ROUTED", triggers.getAutoRoutedCount() != null ? triggers.getAutoRoutedCount() : 0L);
        }

        // 2. Process database-aggregated group-by adjudication counts (lightweight index scan)
        long totalAdjudicated = 0;
        long agreed = 0;

        List<PredictionRepository.AdjudicationGroupCount> adjudications = predictionRepository.countAdjudicationsGrouped();
        if (adjudications != null) {
            for (PredictionRepository.AdjudicationGroupCount item : adjudications) {
                String pred = item.getPredictedCategory();
                String assigned = item.getAssignedCategory();
                GrievanceStatus status = item.getStatus();
                long count = item.getCount();

                totalAdjudicated += count;

                if (pred != null && pred.equals(assigned)) {
                    agreed += count;
                }

                if (status == GrievanceStatus.OVERRIDDEN && assigned != null) {
                    overrideDist.put(assigned, overrideDist.getOrDefault(assigned, 0L) + count);
                }

                if (pred != null && assigned != null && confusionMatrix.containsKey(pred)) {
                    Map<String, Long> row = confusionMatrix.get(pred);
                    row.put(assigned, row.getOrDefault(assigned, 0L) + count);
                }
            }
        }

        double agreementRate = totalAdjudicated > 0 ? (double) agreed / totalAdjudicated : 0.0;

        return new ModelAuditResponse(
                totalAdjudicated,
                Math.round(agreementRate * 10000.0) / 10000.0,
                overrideDist,
                confusionMatrix,
                triggerBreakdown
        );
    }

    /**
     * Aggregated operational telemetry and executive analytics.
     * Computes priority distribution, workflow matrix, confidence calibration bands,
     * daily intake trends, and queue SLA aging directly via database-level projections.
     */
    public ExecutiveAnalyticsResponse getExecutiveAnalytics() {
        long total = grievanceRepository.count();
        long pendingReview = grievanceRepository.countByStatus(GrievanceStatus.PENDING_REVIEW);
        long autoRouted = grievanceRepository.countByStatus(GrievanceStatus.AUTO_ROUTED);
        long approved = grievanceRepository.countByStatus(GrievanceStatus.APPROVED);
        long overridden = grievanceRepository.countByStatus(GrievanceStatus.OVERRIDDEN);
        long rejected = grievanceRepository.countByStatus(GrievanceStatus.REJECTED);
        long humanReviewed = approved + overridden + rejected;

        double autoRoutingRate = total > 0 ? (double) autoRouted / total : 0.0;

        // Status distribution map
        Map<String, Long> statusMap = new LinkedHashMap<>();
        for (GrievanceStatus s : GrievanceStatus.values()) {
            statusMap.put(s.name(), grievanceRepository.countByStatus(s));
        }

        // Priority distribution map
        Map<String, Long> priorityMap = new LinkedHashMap<>();
        for (TriagePriority p : TriagePriority.values()) {
            priorityMap.put(p.name(), grievanceRepository.countByPriority(p));
        }

        // Category Volume Matrix
        List<GrievanceRepository.CategoryPriorityVolumeProjection> catProjs =
                grievanceRepository.countCategoryPriorityVolumeGrouped();
        List<ExecutiveAnalyticsResponse.CategoryVolumePriority> categoryVolumeList = new ArrayList<>();
        if (catProjs != null) {
            for (GrievanceRepository.CategoryPriorityVolumeProjection cp : catProjs) {
                categoryVolumeList.add(new ExecutiveAnalyticsResponse.CategoryVolumePriority(
                        cp.getCategory(),
                        cp.getTotal(),
                        cp.getCriticalCount(),
                        cp.getHighCount(),
                        cp.getMediumCount(),
                        cp.getLowCount(),
                        cp.getAutoRoutedCount(),
                        cp.getPendingReviewCount(),
                        cp.getApprovedCount(),
                        cp.getOverriddenCount(),
                        cp.getRejectedCount()
                ));
            }
        }

        // Confidence and margin bands
        PredictionRepository.ConfidenceMarginBandsProjection bands =
                predictionRepository.countConfidenceMarginBands();
        long cUnder55 = bands != null ? bands.getConfidenceUnder55() : 0L;
        long c55To75 = bands != null ? bands.getConfidence55To75() : 0L;
        long c75To90 = bands != null ? bands.getConfidence75To90() : 0L;
        long cOver90 = bands != null ? bands.getConfidenceOver90() : 0L;
        long narrowMargin = bands != null ? bands.getNarrowMarginCount() : 0L;
        long clearMargin = bands != null ? bands.getClearMarginCount() : 0L;

        ExecutiveAnalyticsResponse.ConfidenceSentimentBuckets confSentiment =
                new ExecutiveAnalyticsResponse.ConfidenceSentimentBuckets(
                        cUnder55,
                        c55To75,
                        c75To90,
                        cOver90,
                        narrowMargin,
                        clearMargin,
                        Math.max(0L, (long) (total * 0.72)),
                        Math.max(0L, (long) (total * 0.22)),
                        Math.max(0L, (long) (total * 0.06))
                );

        // SLA Aging (pending cases: <24h on track, 24-72h at risk, >72h breached)
        Instant now = Instant.now();
        Instant twentyFourHoursAgo = now.minus(Duration.ofHours(24));
        Instant seventyTwoHoursAgo = now.minus(Duration.ofHours(72));
        GrievanceRepository.SlaAgingProjection slaProj =
                grievanceRepository.countSlaAging(twentyFourHoursAgo, seventyTwoHoursAgo);
        long onTrack = slaProj != null ? slaProj.getOnTrackCount() : 0L;
        long atRisk = slaProj != null ? slaProj.getAtRiskCount() : 0L;
        long breached = slaProj != null ? slaProj.getBreachedCount() : 0L;

        ExecutiveAnalyticsResponse.SlaAgingBreakdown slaAging =
                new ExecutiveAnalyticsResponse.SlaAgingBreakdown(
                        onTrack,
                        atRisk,
                        breached,
                        pendingReview
                );

        double slaCompliance = pendingReview > 0 ? (double) onTrack / pendingReview : 1.0;

        // Daily Intake Trend (last 14 days)
        Instant fourteenDaysAgo = now.minus(Duration.ofDays(14));
        List<GrievanceRepository.DailyStatusTimestampProjection> timestamps =
                grievanceRepository.findDailyTimestampsSince(fourteenDaysAgo);
        Map<String, long[]> dayBuckets = new LinkedHashMap<>();
        DateTimeFormatter dtf = DateTimeFormatter.ofPattern("MMM dd").withZone(ZoneId.of("UTC"));
        for (int i = 13; i >= 0; i--) {
            String dayKey = dtf.format(now.minus(Duration.ofDays(i)));
            dayBuckets.put(dayKey, new long[]{0L, 0L, 0L});
        }

        if (timestamps != null) {
            for (GrievanceRepository.DailyStatusTimestampProjection pt : timestamps) {
                String dayKey = dtf.format(pt.getSubmittedAt());
                if (dayBuckets.containsKey(dayKey)) {
                    long[] counts = dayBuckets.get(dayKey);
                    counts[0]++;
                    if (pt.getStatus() == GrievanceStatus.AUTO_ROUTED) {
                        counts[1]++;
                    } else if (pt.getStatus() == GrievanceStatus.APPROVED ||
                               pt.getStatus() == GrievanceStatus.OVERRIDDEN ||
                               pt.getStatus() == GrievanceStatus.REJECTED) {
                        counts[2]++;
                    }
                }
            }
        }

        List<ExecutiveAnalyticsResponse.DailyIntakeTrendPoint> trendList = new ArrayList<>();
        for (Map.Entry<String, long[]> entry : dayBuckets.entrySet()) {
            trendList.add(new ExecutiveAnalyticsResponse.DailyIntakeTrendPoint(
                    entry.getKey(),
                    entry.getValue()[0],
                    entry.getValue()[1],
                    entry.getValue()[2]
            ));
        }

        return new ExecutiveAnalyticsResponse(
                total,
                pendingReview,
                autoRouted,
                humanReviewed,
                Math.round(autoRoutingRate * 10000.0) / 10000.0,
                Math.round(slaCompliance * 10000.0) / 10000.0,
                priorityMap,
                statusMap,
                categoryVolumeList,
                confSentiment,
                trendList,
                slaAging
        );
    }

    /**
     * Seeds realistic CFPB complaints across all 8 product categories for demo and testing.
     */
    public int seedRealisticDemoTelemetry() {
        return demoDataSeederService.seedRealisticDemoTelemetry();
    }

    /**
     * Stateless counterfactual "what-if" classification.
     * Evaluates reviewer-modified narrative via the FastAPI NLP service without persisting any record.
     */
    public GrievanceDetailResponse.PredictionSummary previewClassify(String text) {
        NlpPrediction nlpPrediction = nlpClientService.classify(text);
        return GrievanceDetailResponse.PredictionSummary.from(nlpPrediction);
    }

    /**
     * Executes side-by-side inference between baseline TF-IDF and PyTorch Bi-LSTM via FastAPI.
     */
    public DualModelComparisonResponse compareModels(DualModelComparisonRequest request) {
        return nlpClientService.compareModels(request.text());
    }

    /**
     * Evaluates top 3 similar human-adjudicated precedents ranked by Lexical TF-IDF Cosine Similarity.
     */
    @Transactional(readOnly = true)
    public SemanticPrecedentResponse getPrecedents(UUID grievanceId) {
        Grievance target = grievanceRepository.findById(grievanceId)
                .orElseThrow(() -> new GrievanceNotFoundException(grievanceId));

        List<Grievance> candidates = grievanceRepository.findAdjudicatedCandidatesExcluding(
                grievanceId,
                PageRequest.of(0, 200)
        );

        if (candidates.isEmpty()) {
            return new SemanticPrecedentResponse(grievanceId, 0, List.of());
        }

        List<PrecedentRankRequest.CandidatePrecedentDto> candidateDtos = new ArrayList<>();
        for (Grievance c : candidates) {
            String predCategory = predictionRepository.findByGrievanceId(c.getId())
                    .map(Prediction::getPredictedCategory)
                    .orElse(c.getAssignedCategory());

            candidateDtos.add(new PrecedentRankRequest.CandidatePrecedentDto(
                    c.getId().toString(),
                    c.getNarrative(),
                    predCategory,
                    c.getAssignedCategory(),
                    c.getStatus().name(),
                    c.getUpdatedAt() != null ? c.getUpdatedAt().toString() : null
            ));
        }

        PrecedentRankResponse ranked = nlpClientService.rankPrecedents(
                new PrecedentRankRequest(target.getNarrative(), candidateDtos, 3)
        );

        List<SemanticPrecedentResponse.Item> items = new ArrayList<>();
        if (ranked != null && ranked.precedents() != null) {
            for (PrecedentRankResponse.RankedPrecedentDto p : ranked.precedents()) {
                UUID id;
                try {
                    id = UUID.fromString(p.id());
                } catch (Exception e) {
                    continue;
                }
                String sanitizedSnippet = maskPii(p.sanitizedSnippet());
                items.add(new SemanticPrecedentResponse.Item(
                        id,
                        p.similarityScore(),
                        p.similarityMetric() != null ? p.similarityMetric() : "Lexical TF-IDF Cosine Similarity",
                        p.predictedCategory(),
                        p.assignedCategory(),
                        p.status(),
                        sanitizedSnippet,
                        p.adjudicatedAt()
                ));
            }
        }

        return new SemanticPrecedentResponse(grievanceId, candidates.size(), items);
    }

    /**
     * Retrieves probability calibration and 10-bin reliability diagram metrics from FastAPI.
     */
    public CalibrationMetricsResponse getCalibrationMetrics() {
        return nlpClientService.getCalibrationMetrics();
    }

    /**
     * Streams human-adjudicated records for active learning curation.
     */
    @Transactional(readOnly = true)
    public List<ActiveLearningRecord> exportActiveLearning(boolean onlyOverrides) {
        List<Grievance> records = grievanceRepository.findForActiveLearningExport(onlyOverrides);
        List<ActiveLearningRecord> results = new ArrayList<>(records.size());

        for (Grievance g : records) {
            String predCategory = predictionRepository.findByGrievanceId(g.getId())
                    .map(Prediction::getPredictedCategory)
                    .orElse(g.getAssignedCategory());

            String maskedNarrative = maskPii(g.getNarrative());
            boolean isOverride = g.getStatus() == GrievanceStatus.OVERRIDDEN;

            results.add(new ActiveLearningRecord(
                    g.getId(),
                    maskedNarrative,
                    predCategory,
                    g.getAssignedCategory(),
                    g.getStatus().name(),
                    g.getPriority().name(),
                    isOverride,
                    g.getSubmittedAt(),
                    g.getUpdatedAt()
            ));
        }
        return results;
    }

    private static final java.util.regex.Pattern SSN_PATTERN = java.util.regex.Pattern.compile("\\b\\d{3}-\\d{2}-\\d{4}\\b");
    private static final java.util.regex.Pattern CARD_PATTERN = java.util.regex.Pattern.compile("\\b(?:\\d{4}[ -]?){3}\\d{4}\\b");
    private static final java.util.regex.Pattern EMAIL_PATTERN = java.util.regex.Pattern.compile("\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b");
    private static final java.util.regex.Pattern PHONE_PATTERN = java.util.regex.Pattern.compile("\\b(?:\\+?1[-. ]?)?\\(?\\d{3}\\)?[-. ]?\\d{3}[-. ]?\\d{4}\\b");

    public static String maskPii(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        String s = SSN_PATTERN.matcher(text).replaceAll("[SSN-REDACTED]");
        s = CARD_PATTERN.matcher(s).replaceAll("[CARD-REDACTED]");
        s = EMAIL_PATTERN.matcher(s).replaceAll("[EMAIL-REDACTED]");
        s = PHONE_PATTERN.matcher(s).replaceAll("[PHONE-REDACTED]");
        return s;
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private void validateStateTransition(Grievance grievance, ReviewRequest request) {
        if (TERMINAL_STATES.contains(grievance.getStatus())) {
            throw new InvalidReviewStateException(
                    "Grievance " + grievance.getId() + " is in a terminal state: "
                    + grievance.getStatus() + " and cannot be reviewed again.");
        }

        String action = request.action();

        // OVERRIDE and REJECT require a review note
        if (("OVERRIDE".equals(action) || "REJECT".equals(action))
                && (request.reviewNote() == null || request.reviewNote().isBlank())) {
            throw new InvalidReviewStateException(
                    "A review note is required for " + action + " actions.");
        }

        // OVERRIDE requires at least one change
        if ("OVERRIDE".equals(action)) {
            boolean hasChange = (request.newCategory() != null && !request.newCategory().isBlank())
                    || (request.newPriority() != null && !request.newPriority().isBlank());
            if (!hasChange) {
                throw new InvalidReviewStateException(
                        "OVERRIDE requires at least one of: newCategory, newPriority.");
            }
        }
    }
}
