package ai.civicresolve.backend.dto;

import java.util.Map;

/**
 * Aggregated AI audit and reviewer calibration analytics.
 * Exposed to authenticated staff via GET /api/grievances/analytics/model-audit.
 */
public record ModelAuditResponse(
        long totalAdjudicated,
        double reviewerAgreementRate,
        Map<String, Long> categoryOverrideDistribution,
        Map<String, Map<String, Long>> confusionMatrix,
        Map<String, Long> triggerBreakdown
) {}
