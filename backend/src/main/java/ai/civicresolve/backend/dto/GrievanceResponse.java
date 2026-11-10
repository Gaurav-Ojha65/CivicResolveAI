package ai.civicresolve.backend.dto;

import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;

import java.time.Instant;
import java.util.UUID;

/**
 * Response DTO for a grievance case.
 * Does NOT expose the raw narrative text in list responses to protect privacy.
 */
public record GrievanceResponse(
        UUID id,
        String assignedCategory,
        TriagePriority priority,
        GrievanceStatus status,
        boolean reviewRequired,
        Instant submittedAt,
        Instant updatedAt,
        /** Current JPA optimistic locking version. */
        Long version
) {
    /**
     * Overloaded constructor for 7-parameter calls, preserving backwards compatibility
     * with tests and callers constructed before version exposure.
     */
    public GrievanceResponse(
            UUID id,
            String assignedCategory,
            TriagePriority priority,
            GrievanceStatus status,
            boolean reviewRequired,
            Instant submittedAt,
            Instant updatedAt
    ) {
        this(id, assignedCategory, priority, status, reviewRequired, submittedAt, updatedAt, null);
    }

    /** Factory method — populates version and never exposes narrative in the response. */
    public static GrievanceResponse from(Grievance g) {
        return new GrievanceResponse(
                g.getId(),
                g.getAssignedCategory(),
                g.getPriority(),
                g.getStatus(),
                g.isReviewRequired(),
                g.getSubmittedAt(),
                g.getUpdatedAt(),
                g.getVersion()
        );
    }
}
