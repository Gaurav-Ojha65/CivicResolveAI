package ai.civicresolve.backend.dto;

import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;

import java.time.Instant;
import java.util.UUID;

/**
 * Dedicated response DTO returned exclusively on initial complaint submission.
 *
 * <p>Contains the raw, one-time tracking secret. This secret is NEVER stored at rest,
 * never logged, and never included in any other response DTO or reviewer endpoint.
 */
public record GrievanceSubmissionResponse(
        UUID id,
        String trackingSecret,
        String category,
        TriagePriority priority,
        GrievanceStatus status,
        boolean reviewRequired,
        Instant submittedAt,
        Instant updatedAt,
        Long version
) {
    /** Secondary accessor for backward-compatibility with callers expecting assignedCategory. */
    public String assignedCategory() {
        return category;
    }

    @Override
    public String toString() {
        // Defensively protect the raw tracking secret from appearing in log statements or exception messages
        return "GrievanceSubmissionResponse[id=" + id
                + ", trackingSecret=[PROTECTED]"
                + ", category=" + category
                + ", priority=" + priority
                + ", status=" + status
                + ", reviewRequired=" + reviewRequired
                + ", submittedAt=" + submittedAt
                + ", updatedAt=" + updatedAt
                + ", version=" + version + "]";
    }
}
