package ai.civicresolve.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request payload for stateless counterfactual "what-if" classification.
 * Used exclusively by authenticated reviewers for sensitivity analysis.
 */
public record PreviewClassifyRequest(
        @NotBlank(message = "Narrative text cannot be blank.")
        @Size(min = 20, max = 10000, message = "Narrative text must be between 20 and 10,000 characters.")
        String text
) {}
