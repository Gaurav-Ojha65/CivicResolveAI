package ai.civicresolve.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DualModelComparisonRequest(
    @NotBlank(message = "Text is required")
    @Size(min = 10, max = 10000, message = "Text must be between 10 and 10,000 characters")
    @JsonProperty("text")
    String text
) {}
