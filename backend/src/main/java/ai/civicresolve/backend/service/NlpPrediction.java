package ai.civicresolve.backend.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.Map;

/**
 * Typed contract for the FastAPI NLP prediction response.
 *
 * <p>Field names mirror the FastAPI {@code ClassifyResponse} Pydantic schema exactly,
 * mapped explicitly via {@link JsonProperty}.
 *
 * <p>Immutability: this record is populated from the NLP upstream response and
 * never modified by the Spring application.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record NlpPrediction(
        @JsonProperty("product_category") String productCategory,
        @JsonProperty("confidence") Double confidence,
        @JsonProperty("margin") Double margin,
        @JsonProperty("probabilities") Map<String, Double> probabilities,
        @JsonProperty("model_used") String modelUsed,
        @JsonProperty("model_version") String modelVersion,
        @JsonProperty("flag_for_review") Boolean flagForReview,
        @JsonProperty("review_reasons") List<String> reviewReasons,
        @JsonProperty("triage_priority") String triagePriority,
        @JsonProperty("priority_reasons") List<String> priorityReasons,
        @JsonProperty("sentiment_score") Double sentimentScore,
        @JsonProperty("sentiment_label") String sentimentLabel,
        @JsonProperty("disclaimer") String disclaimer,
        @JsonProperty("explanation") NlpExplanation explanation
) {
    /**
     * Backward-compatible 13-parameter constructor for tests and clients without explanation.
     */
    public NlpPrediction(
            String productCategory,
            Double confidence,
            Double margin,
            Map<String, Double> probabilities,
            String modelUsed,
            String modelVersion,
            Boolean flagForReview,
            List<String> reviewReasons,
            String triagePriority,
            List<String> priorityReasons,
            Double sentimentScore,
            String sentimentLabel,
            String disclaimer
    ) {
        this(productCategory, confidence, margin, probabilities, modelUsed, modelVersion,
                flagForReview, reviewReasons, triagePriority, priorityReasons,
                sentimentScore, sentimentLabel, disclaimer, null);
    }
}
