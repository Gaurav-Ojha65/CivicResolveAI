package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record PrecedentRankRequest(
    @JsonProperty("query_text") String queryText,
    @JsonProperty("candidates") List<CandidatePrecedentDto> candidates,
    @JsonProperty("top_k") int topK
) {
    public record CandidatePrecedentDto(
        @JsonProperty("id") String id,
        @JsonProperty("text") String text,
        @JsonProperty("predicted_category") String predictedCategory,
        @JsonProperty("assigned_category") String assignedCategory,
        @JsonProperty("status") String status,
        @JsonProperty("adjudicated_at") String adjudicatedAt
    ) {}
}
