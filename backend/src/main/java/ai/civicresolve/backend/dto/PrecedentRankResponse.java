package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record PrecedentRankResponse(
    @JsonProperty("candidates_evaluated") int candidatesEvaluated,
    @JsonProperty("top_k") int topK,
    @JsonProperty("precedents") List<RankedPrecedentDto> precedents,
    @JsonProperty("similarity_metric") String similarityMetric
) {
    public record RankedPrecedentDto(
        @JsonProperty("id") String id,
        @JsonProperty("similarity_score") double similarityScore,
        @JsonProperty("similarity_metric") String similarityMetric,
        @JsonProperty("predicted_category") String predictedCategory,
        @JsonProperty("assigned_category") String assignedCategory,
        @JsonProperty("status") String status,
        @JsonProperty("sanitized_snippet") String sanitizedSnippet,
        @JsonProperty("adjudicated_at") String adjudicatedAt
    ) {}
}
