package ai.civicresolve.backend.dto;

import ai.civicresolve.backend.entity.GrievanceStatus;

import java.time.Instant;

/**
 * Sanitized, consumer-safe timeline event projected from the internal append-only audit log.
 *
 * <p>Never exposes staff usernames, reviewer notes, internal prediction metrics, or category/priority diffs.
 */
public record ConsumerTimelineEvent(
        String stage,
        GrievanceStatus status,
        String title,
        String description,
        Instant timestamp
) {}
