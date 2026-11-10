package ai.civicresolve.backend.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * Typed contract for the FastAPI explainable AI (XAI) feature attribution response.
 *
 * <p>Field names mirror the FastAPI {@code ExplanationResponse} Pydantic schema exactly,
 * mapped explicitly via {@link JsonProperty}.
 *
 * <p>Immutability: this record is populated from the NLP upstream response and
 * never modified by the Spring application.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record NlpExplanation(
        @JsonProperty("method") String method,
        @JsonProperty("version") String version,
        @JsonProperty("predicted_class") String predictedClass,
        @JsonProperty("runner_up_class") String runnerUpClass,
        @JsonProperty("predicted_decision_score") Double predictedDecisionScore,
        @JsonProperty("runner_up_decision_score") Double runnerUpDecisionScore,
        @JsonProperty("decision_score_margin") Double decisionScoreMargin,
        @JsonProperty("predicted_intercept") Double predictedIntercept,
        @JsonProperty("predicted_total_feature_contribution") Double predictedTotalFeatureContribution,
        @JsonProperty("runner_up_intercept") Double runnerUpIntercept,
        @JsonProperty("runner_up_total_feature_contribution") Double runnerUpTotalFeatureContribution,
        @JsonProperty("intercept_difference") Double interceptDifference,
        @JsonProperty("total_difference_contribution") Double totalDifferenceContribution,
        @JsonProperty("active_feature_count") Integer activeFeatureCount,
        @JsonProperty("top_positive_features") List<FeatureContributionItem> topPositiveFeatures,
        @JsonProperty("top_negative_features") List<FeatureContributionItem> topNegativeFeatures,
        @JsonProperty("top_positive_runner_up_differences") List<RunnerUpDifferenceItem> topPositiveRunnerUpDifferences,
        @JsonProperty("top_negative_runner_up_differences") List<RunnerUpDifferenceItem> topNegativeRunnerUpDifferences,
        @JsonProperty("model_artifact_sha256") String modelArtifactSha256,
        @JsonProperty("disclaimer") String disclaimer
) {
    public NlpExplanation {
        topPositiveFeatures = topPositiveFeatures != null ? List.copyOf(topPositiveFeatures) : List.of();
        topNegativeFeatures = topNegativeFeatures != null ? List.copyOf(topNegativeFeatures) : List.of();
        topPositiveRunnerUpDifferences = topPositiveRunnerUpDifferences != null ? List.copyOf(topPositiveRunnerUpDifferences) : List.of();
        topNegativeRunnerUpDifferences = topNegativeRunnerUpDifferences != null ? List.copyOf(topNegativeRunnerUpDifferences) : List.of();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FeatureContributionItem(
            @JsonProperty("feature") String feature,
            @JsonProperty("contribution") Double contribution
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record RunnerUpDifferenceItem(
            @JsonProperty("feature") String feature,
            @JsonProperty("difference_contribution") Double differenceContribution
    ) {}
}
