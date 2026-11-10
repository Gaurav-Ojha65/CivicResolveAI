package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.UUID;

public record ActiveLearningRecord(
    @JsonProperty("id") UUID id,
    @JsonProperty("maskedNarrative") String maskedNarrative,
    @JsonProperty("predictedCategory") String predictedCategory,
    @JsonProperty("assignedCategory") String assignedCategory,
    @JsonProperty("status") String status,
    @JsonProperty("priority") String priority,
    @JsonProperty("isOverride") boolean isOverride,
    @JsonProperty("submittedAt") Instant submittedAt,
    @JsonProperty("adjudicatedAt") Instant adjudicatedAt
) {}
