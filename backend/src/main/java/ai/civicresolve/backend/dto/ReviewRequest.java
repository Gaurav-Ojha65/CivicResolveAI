package ai.civicresolve.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for the review endpoint (PATCH /api/grievances/{id}/review).
 *
 * <p>The {@code action} field drives the state machine:
 * <ul>
 *   <li>{@code APPROVE} — confirm the automated routing.</li>
 *   <li>{@code OVERRIDE} — change category or priority; requires {@code reviewNote}.</li>
 *   <li>{@code REJECT} — reject the complaint; requires {@code reviewNote}.</li>
 * </ul>
 *
 * <p>Actor identity is derived from the Spring Security context, not from this payload.
 */
public record ReviewRequest(

        @NotNull(message = "Action is required.")
        @Pattern(regexp = "APPROVE|OVERRIDE|REJECT",
                 message = "Action must be one of: APPROVE, OVERRIDE, REJECT.")
        String action,

        /** New category (OVERRIDE only). Must be a supported approved label. */
        String newCategory,

        /** New priority (OVERRIDE only). Must be LOW, MEDIUM, HIGH, or CRITICAL. */
        @Pattern(regexp = "LOW|MEDIUM|HIGH|CRITICAL|",
                 message = "newPriority must be one of: LOW, MEDIUM, HIGH, CRITICAL.")
        String newPriority,

        /** Required for OVERRIDE and REJECT; optional for APPROVE. */
        @Size(max = 2000, message = "Review note must not exceed 2000 characters.")
        String reviewNote,

        /**
         * Mandatory browser-level optimistic lock check.
         * If present and matching, the review proceeds.
         * Missing or negative values fail request validation with HTTP 400.
         * Stale values produce HTTP 409 Conflict.
         */
        @NotNull(message = "expectedVersion is required.")
        @PositiveOrZero(message = "expectedVersion must be positive or zero.")
        Long expectedVersion

) {}
