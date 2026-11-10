package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record ModelInferenceSummary(
    @JsonProperty("model_name") String modelName,
    @JsonProperty("model_type") String modelType,
    @JsonProperty("model_version_sha256") String modelVersionSha256,
    @JsonProperty("predicted_category") String predictedCategory,
    @JsonProperty("confidence") double confidence,
    @JsonProperty("margin") double margin,
    @JsonProperty("probabilities") Map<String, Double> probabilities,
    @JsonProperty("latency_ms") double latencyMs,
    @JsonProperty("token_or_feature_count") int tokenOrFeatureCount,
    @JsonProperty("truncated") boolean truncated
) {}
