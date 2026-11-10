package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import ai.civicresolve.backend.service.NlpExplanation;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Immutable NLP prediction record.
 *
 * <p>Stores the original prediction from FastAPI exactly as received.
 * The application role cannot UPDATE or DELETE prediction history.
 * All fields are set at insert time and never mutated.
 */
@Entity
@Table(name = "predictions")
public class Prediction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "grievance_id", nullable = false, updatable = false)
    private Grievance grievance;

    /** Predicted product category from the NLP service. */
    @Column(name = "predicted_category", nullable = false, length = 120, updatable = false)
    private String predictedCategory;

    /** Model identifier returned by FastAPI (e.g. "baseline_tfidf_logreg"). */
    @Column(name = "model_used", nullable = false, length = 80, updatable = false)
    private String modelUsed;

    /** SHA-256 artifact version stamp. */
    @Column(name = "model_version", nullable = false, length = 64, updatable = false)
    private String modelVersion;

    /** Uncalibrated top-class probability estimate (0–1). */
    @Column(name = "confidence", nullable = false, updatable = false)
    private double confidence;

    /** Probability difference between top and runner-up class estimates. */
    @Column(name = "margin", nullable = false, updatable = false)
    private double margin;

    /**
     * Full class probability distribution stored as JSONB.
     * Keys are approved category labels; values are uncalibrated probability estimates.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "probabilities", nullable = false, updatable = false,
            columnDefinition = "jsonb")
    private Map<String, Double> probabilities;

    /** Whether FastAPI flagged this prediction for human review. */
    @Column(name = "flag_for_review", nullable = false, updatable = false)
    private boolean flagForReview;

    /**
     * Explanatory review reasons from FastAPI, stored as JSONB array.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "review_reasons", updatable = false, columnDefinition = "jsonb")
    private List<String> reviewReasons;

    /** Rule-based triage priority returned by FastAPI. */
    @Column(name = "triage_priority", nullable = false, length = 20, updatable = false)
    private String triagePriority;

    /**
     * Priority reason keywords from FastAPI rule engine, stored as JSONB array.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "priority_reasons", updatable = false, columnDefinition = "jsonb")
    private List<String> priorityReasons;

    /** VADER compound sentiment score (-1.0 to +1.0). */
    @Column(name = "sentiment_score", updatable = false)
    private Double sentimentScore;

    /** Sentiment label: NEGATIVE, NEUTRAL, or POSITIVE. */
    @Column(name = "sentiment_label", length = 20, updatable = false)
    private String sentimentLabel;

    /**
     * Nullable JSONB snapshot of FastAPI linear feature attribution explanation.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "explanation", updatable = false, columnDefinition = "jsonb")
    private NlpExplanation explanation;

    /** Timestamp when the prediction was persisted. */
    @Column(name = "predicted_at", nullable = false, updatable = false)
    private Instant predictedAt;

    protected Prediction() {}

    public Prediction(Grievance grievance,
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
                      String sentimentLabel) {
        this(grievance, predictedCategory, modelUsed, modelVersion, confidence, margin,
             probabilities, flagForReview, reviewReasons, triagePriority, priorityReasons,
             sentimentScore, sentimentLabel, null);
    }

    public Prediction(Grievance grievance,
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
                      NlpExplanation explanation) {
        this.grievance = grievance;
        this.predictedCategory = predictedCategory;
        this.modelUsed = modelUsed;
        this.modelVersion = modelVersion;
        this.confidence = confidence;
        this.margin = margin;
        this.probabilities = Map.copyOf(probabilities);
        this.flagForReview = flagForReview;
        this.reviewReasons = List.copyOf(reviewReasons != null ? reviewReasons : List.of());
        this.triagePriority = triagePriority;
        this.priorityReasons = List.copyOf(priorityReasons != null ? priorityReasons : List.of());
        this.sentimentScore = sentimentScore;
        this.sentimentLabel = sentimentLabel;
        this.explanation = explanation;
        this.predictedAt = Instant.now();
    }

    // ─── Getters (no setters — this entity is immutable after creation) ──────

    public Long getId() { return id; }
    public Grievance getGrievance() { return grievance; }
    public String getPredictedCategory() { return predictedCategory; }
    public String getModelUsed() { return modelUsed; }
    public String getModelVersion() { return modelVersion; }
    public double getConfidence() { return confidence; }
    public double getMargin() { return margin; }
    public Map<String, Double> getProbabilities() { return probabilities; }
    public boolean isFlagForReview() { return flagForReview; }
    public List<String> getReviewReasons() { return reviewReasons; }
    public String getTriagePriority() { return triagePriority; }
    public List<String> getPriorityReasons() { return priorityReasons; }
    public Double getSentimentScore() { return sentimentScore; }
    public String getSentimentLabel() { return sentimentLabel; }
    public NlpExplanation getExplanation() { return explanation; }
    public Instant getPredictedAt() { return predictedAt; }

    public void setPredictedAt(Instant predictedAt) {
        this.predictedAt = predictedAt;
    }
}
