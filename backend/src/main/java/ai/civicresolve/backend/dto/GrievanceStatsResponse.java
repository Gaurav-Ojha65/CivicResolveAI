package ai.civicresolve.backend.dto;

import java.util.Map;

/**
 * Stats response for the reviewer dashboard.
 */
public record GrievanceStatsResponse(
        long total,
        Map<String, Long> byStatus,
        Map<String, Long> byPriority,
        long pendingReview
) {}
