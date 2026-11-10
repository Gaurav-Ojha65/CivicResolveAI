package ai.civicresolve.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for submitting a new grievance.
 *
 * <p>Only the {@code description} (narrative) field is sent to the NLP service.
 * Contact details are stored separately and never passed to FastAPI.
 */
public record GrievanceRequest(

        @NotBlank(message = "Description is required and must not be blank.")
        @Size(min = 20, max = 5000,
              message = "Description must be between 20 and 5000 characters.")
        String description

) {}
