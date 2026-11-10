package ai.civicresolve.backend.dto;

import ai.civicresolve.backend.entity.AuditLog;
import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.Prediction;
import ai.civicresolve.backend.entity.TriagePriority;
import ai.civicresolve.backend.service.NlpExplanation;
import ai.civicresolve.backend.service.NlpPrediction;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Detailed view of a single grievance, including the original NLP prediction,
 * explainability metadata, and chronological audit history.
 * Exposed only to authenticated staff via GET /api/grievances/{id}.
 */
public record GrievanceDetailResponse(
        UUID id,
        /** Complaint narrative submitted by the citizen. Visible to authenticated reviewers only. */
        String narrative,
        String assignedCategory,
        TriagePriority priority,
        GrievanceStatus status,
        boolean reviewRequired,
        Instant submittedAt,
        Instant updatedAt,
        /** JPA version counter. Browsers echo this back as expectedVersion for optimistic locking. */
        Long version,
        PredictionSummary originalPrediction,
        List<AuditHistoryItem> auditHistory
) {

    /**
     * Backward-compatible 10-parameter constructor for existing tests and call sites without audit history.
     */
    public GrievanceDetailResponse(
            UUID id,
            String narrative,
            String assignedCategory,
            TriagePriority priority,
            GrievanceStatus status,
            boolean reviewRequired,
            Instant submittedAt,
            Instant updatedAt,
            Long version,
            PredictionSummary originalPrediction
    ) {
        this(id, narrative, assignedCategory, priority, status, reviewRequired,
                submittedAt, updatedAt, version, originalPrediction, List.of());
    }

    public record AuditHistoryItem(
            Long id,
            String actor,
            String action,
            GrievanceStatus previousStatus,
            GrievanceStatus newStatus,
            String previousCategory,
            String newCategory,
            String previousPriority,
            String newPriority,
            String reviewNote,
            Instant timestamp
    ) {
        public static AuditHistoryItem from(AuditLog log) {
            if (log == null) {
                return null;
            }
            return new AuditHistoryItem(
                    log.getId(),
                    log.getActor(),
                    log.getAction(),
                    log.getPreviousStatus(),
                    log.getNewStatus(),
                    log.getPreviousCategory(),
                    log.getNewCategory(),
                    log.getPreviousPriority(),
                    log.getNewPriority(),
                    log.getReviewNote(),
                    log.getCreatedAt()
            );
        }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record FeatureContribution(
            @JsonProperty("feature") String feature,
            @JsonProperty("tfidfValue") Double tfidfValue,
            @JsonProperty("coefficient") Double coefficient,
            @JsonProperty("contribution") double contribution
    ) {
        public FeatureContribution(String feature, double contribution) {
            this(feature, null, null, contribution);
        }
    }

    public record ExplanationSummary(
            String predictedClass,
            double predictedDecisionScore,
            double predictedIntercept,
            String runnerUpClass,
            double runnerUpDecisionScore,
            double runnerUpIntercept,
            double decisionScoreMargin,
            List<FeatureContribution> topPositiveFeatures,
            List<FeatureContribution> topNegativeFeatures,
            List<FeatureContribution> topDifferenceFeatures,
            String modelProvenanceSha256,
            String explanationGeneratedAt
    ) {
        public static ExplanationSummary from(NlpExplanation expl, Instant generatedAt) {
            if (expl == null) {
                return null;
            }
            List<FeatureContribution> pos = expl.topPositiveFeatures() != null
                    ? expl.topPositiveFeatures().stream()
                            .map(item -> new FeatureContribution(item.feature(), item.contribution()))
                            .toList()
                    : List.of();

            List<FeatureContribution> neg = expl.topNegativeFeatures() != null
                    ? expl.topNegativeFeatures().stream()
                            .map(item -> new FeatureContribution(item.feature(), item.contribution()))
                            .toList()
                    : List.of();

            List<FeatureContribution> diff = expl.topPositiveRunnerUpDifferences() != null
                    ? expl.topPositiveRunnerUpDifferences().stream()
                            .map(item -> new FeatureContribution(item.feature(), item.differenceContribution()))
                            .toList()
                    : List.of();

            String timestamp = generatedAt != null ? generatedAt.toString() : Instant.now().toString();

            return new ExplanationSummary(
                    expl.predictedClass(),
                    expl.predictedDecisionScore(),
                    expl.predictedIntercept(),
                    expl.runnerUpClass(),
                    expl.runnerUpDecisionScore(),
                    expl.runnerUpIntercept(),
                    expl.decisionScoreMargin(),
                    pos,
                    neg,
                    diff,
                    expl.modelArtifactSha256(),
                    timestamp
            );
        }
    }

    public record PredictionSummary(
            String predictedCategory,
            String modelUsed,
            String modelVersion,
            double confidence,
            double margin,
            Map<String, Double> probabilities,
            boolean flagForReview,
            List<String> reviewReasons,
            String triagePriority,
            List<String> priorityReasons,
            Double sentimentScore,
            String sentimentLabel,
            Instant predictedAt,
            ExplanationSummary explanation
    ) {
        public PredictionSummary(
                String predictedCategory,
                String modelUsed,
                String modelVersion,
                double confidence,
                double margin,
                Map<String, Double> probabilities,
                boolean flagForReview,
                List<String> reviewReasons,
                String triagePriority,
                List<String> priorityReasons,
                Double sentimentScore,
                String sentimentLabel,
                Instant predictedAt
        ) {
            this(predictedCategory, modelUsed, modelVersion, confidence, margin,
                 probabilities, flagForReview, reviewReasons, triagePriority,
                 priorityReasons, sentimentScore, sentimentLabel, predictedAt, null);
        }

        public static PredictionSummary from(Prediction p) {
            if (p == null) {
                return null;
            }
            ExplanationSummary explSummary = ExplanationSummary.from(p.getExplanation(), p.getPredictedAt());
            return new PredictionSummary(
                    p.getPredictedCategory(),
                    p.getModelUsed(),
                    p.getModelVersion(),
                    p.getConfidence(),
                    p.getMargin(),
                    p.getProbabilities(),
                    p.isFlagForReview(),
                    p.getReviewReasons(),
                    p.getTriagePriority(),
                    p.getPriorityReasons(),
                    p.getSentimentScore(),
                    p.getSentimentLabel(),
                    p.getPredictedAt(),
                    explSummary
            );
        }

        public static PredictionSummary from(NlpPrediction p) {
            if (p == null) {
                return null;
            }
            Instant now = Instant.now();
            ExplanationSummary explSummary = ExplanationSummary.from(p.explanation(), now);
            return new PredictionSummary(
                    p.productCategory(),
                    p.modelUsed(),
                    p.modelVersion(),
                    p.confidence() != null ? p.confidence() : 0.0,
                    p.margin() != null ? p.margin() : 0.0,
                    p.probabilities() != null ? p.probabilities() : Map.of(),
                    Boolean.TRUE.equals(p.flagForReview()),
                    p.reviewReasons() != null ? p.reviewReasons() : List.of(),
                    p.triagePriority(),
                    p.priorityReasons() != null ? p.priorityReasons() : List.of(),
                    p.sentimentScore(),
                    p.sentimentLabel(),
                    now,
                    explSummary
            );
        }
    }

    public static GrievanceDetailResponse from(Grievance g, Prediction p) {
        return from(g, p, List.of());
    }

    public static GrievanceDetailResponse from(Grievance g, Prediction p, List<AuditLog> auditLogs) {
        List<AuditHistoryItem> history = auditLogs != null
                ? auditLogs.stream().map(AuditHistoryItem::from).toList()
                : List.of();
        return new GrievanceDetailResponse(
                g.getId(),
                g.getNarrative(),
                g.getAssignedCategory(),
                g.getPriority(),
                g.getStatus(),
                g.isReviewRequired(),
                g.getSubmittedAt(),
                g.getUpdatedAt(),
                g.getVersion(),
                p != null ? PredictionSummary.from(p) : null,
                history
        );
    }

    /**
     * Custom toString() that redacts the complaint narrative to prevent accidental
     * log leakage while retaining structured metadata for operational diagnostics.
     */
    @Override
    public String toString() {
        return "GrievanceDetailResponse[" +
                "id=" + id +
                ", narrative=[REDACTED " + (narrative != null ? narrative.length() + " chars" : "null") + "]" +
                ", assignedCategory=" + assignedCategory +
                ", priority=" + priority +
                ", status=" + status +
                ", reviewRequired=" + reviewRequired +
                ", submittedAt=" + submittedAt +
                ", updatedAt=" + updatedAt +
                ", version=" + version +
                ", originalPrediction=" + originalPrediction +
                ", auditHistory=" + (auditHistory != null ? auditHistory.size() + " items" : "null") +
                "]";
    }
}
