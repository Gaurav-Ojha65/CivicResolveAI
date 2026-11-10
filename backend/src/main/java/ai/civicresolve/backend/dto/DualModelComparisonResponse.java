package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record DualModelComparisonResponse(
    @JsonProperty("baseline") ModelInferenceSummary baseline,
    @JsonProperty("bilstm") ModelInferenceSummary bilstm,
    @JsonProperty("models_agree") boolean modelsAgree,
    @JsonProperty("confidence_delta") double confidenceDelta,
    @JsonProperty("disclaimer") String disclaimer
) {}
