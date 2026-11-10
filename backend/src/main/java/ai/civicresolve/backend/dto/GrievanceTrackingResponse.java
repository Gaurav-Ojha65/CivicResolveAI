package ai.civicresolve.backend.dto;

import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Public response DTO for anonymous consumer complaint tracking.
 *
 * <p>Contains only safe, customer-facing tracking and timeline data. Never exposes complaint narratives,
 * internal prediction scores, model metadata, reviewer comments, or database credentials.
 */
public record GrievanceTrackingResponse(
        UUID referenceId,
        GrievanceStatus status,
        String assignedCategory,
        TriagePriority priority,
        Instant submittedAt,
        Instant updatedAt,
        List<ConsumerTimelineEvent> timeline
) {}
