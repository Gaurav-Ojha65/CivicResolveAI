package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.UUID;

public record SemanticPrecedentResponse(
    @JsonProperty("queryGrievanceId") UUID queryGrievanceId,
    @JsonProperty("candidatesEvaluated") int candidatesEvaluated,
    @JsonProperty("precedents") List<Item> precedents
) {
    public record Item(
        @JsonProperty("grievanceId") UUID grievanceId,
        @JsonProperty("similarityScore") double similarityScore,
        @JsonProperty("similarityMetric") String similarityMetric,
        @JsonProperty("predictedCategory") String predictedCategory,
        @JsonProperty("assignedCategory") String assignedCategory,
        @JsonProperty("status") String status,
        @JsonProperty("sanitizedSnippet") String sanitizedSnippet,
        @JsonProperty("adjudicatedAt") String adjudicatedAt
    ) {}
}
