package ai.civicresolve.backend.service;

import ai.civicresolve.backend.dto.GrievanceSubmissionResponse;
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

/**
 * Dedicated Spring-managed persistence bean for grievance submissions.
 *
 * <p>Separated from {@link GrievanceService} to guarantee Spring AOP proxy interception
 * for {@code @Transactional} execution, eliminating self-invocation defects while keeping
 * remote NLP HTTP calls outside the database transaction boundary.
 */
@Service
public class GrievancePersistenceService {

    private static final Logger log = LoggerFactory.getLogger(GrievancePersistenceService.class);

    private final GrievanceRepository grievanceRepository;
    private final PredictionRepository predictionRepository;
    private final AuditLogRepository auditLogRepository;
    private final GrievanceTrackingCredentialRepository trackingCredentialRepository;
    private final TrackingCryptoService trackingCryptoService;

    public GrievancePersistenceService(GrievanceRepository grievanceRepository,
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

    /**
     * Atomically persists the grievance, original prediction snapshot, initial audit record,
     * and tracking credential (salted SHA-256 hash and salt only).
     *
     * <p>All four database writes participate in a single Spring-managed transaction and
     * roll back together if any persistence operation fails. The plaintext tracking secret
     * is returned exactly once in {@link GrievanceSubmissionResponse} and is never stored at rest.
     */
    @Transactional
    public GrievanceSubmissionResponse persistSubmission(String narrative, NlpPrediction pred) {
        GrievanceStatus status = pred.flagForReview()
                ? GrievanceStatus.PENDING_REVIEW
                : GrievanceStatus.AUTO_ROUTED;

        TriagePriority priority = TriagePriority.valueOf(pred.triagePriority());

        // 1. Persist Grievance
        Grievance grievance = new Grievance(
                narrative,
                pred.productCategory(),
                priority,
                status,
                pred.flagForReview()
        );
        grievanceRepository.save(grievance);

        // 2. Persist Prediction Snapshot
        Prediction prediction = new Prediction(
                grievance,
                pred.productCategory(),
                pred.modelUsed(),
                pred.modelVersion(),
                pred.confidence(),
                pred.margin(),
                pred.probabilities(),
                pred.flagForReview(),
                pred.reviewReasons(),
                pred.triagePriority(),
                pred.priorityReasons(),
                pred.sentimentScore(),
                pred.sentimentLabel(),
                pred.explanation()
        );
        predictionRepository.save(prediction);

        // 3. Persist Initial Audit Record
        AuditLog auditEntry = AuditLog.builder(grievance, "SYSTEM", "SUBMIT")
                .newStatus(status)
                .newCategory(pred.productCategory())
                .newPriority(pred.triagePriority())
                .build();
        auditLogRepository.save(auditEntry);

        // 4. Generate & Persist Tracking Credential (hash + salt only, zero plaintext at rest)
        TrackingCryptoService.GeneratedCredential credential = trackingCryptoService.generateCredential();
        GrievanceTrackingCredential trackingCred = new GrievanceTrackingCredential(
                grievance.getId(),
                credential.secretHash(),
                credential.salt()
        );
        trackingCredentialRepository.save(trackingCred);

        log.info("Grievance submitted [id={}, status={}, priority={}]",
                grievance.getId(), status, priority);

        return new GrievanceSubmissionResponse(
                grievance.getId(),
                credential.rawSecret(),
                grievance.getAssignedCategory(),
                grievance.getPriority(),
                grievance.getStatus(),
                grievance.isReviewRequired(),
                grievance.getSubmittedAt(),
                grievance.getUpdatedAt(),
                grievance.getVersion()
        );
    }
}
