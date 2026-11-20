package ai.civicresolve.backend.dto;

import java.util.List;
import java.util.Map;

/**
 * Enterprise operational telemetry and executive analytics response.
 * Powers the Executive Analytics hub and real-time operations dashboard.
 */
public record ExecutiveAnalyticsResponse(
        long totalComplaints,
        long pendingReview,
        long autoRouted,
        long humanReviewed,
        double autoRoutingEfficiencyRate,
        /**
         * Legacy API field retained for compatibility. It is the share of pending cases in the
         * youngest fixed age band, not a configured or legally verified SLA compliance measure.
         */
        double slaComplianceRate,
        Map<String, Long> priorityDistribution,
        Map<String, Long> statusDistribution,
        List<CategoryVolumePriority> categoryVolumeMatrix,
        ConfidenceSentimentBuckets confidenceSentimentBuckets,
        List<DailyIntakeTrendPoint> dailyIntakeTrend,
        SlaAgingBreakdown slaAgingBreakdown
) {
    public record CategoryVolumePriority(
            String category,
            long total,
            long critical,
            long high,
            long medium,
            long low,
            long autoRouted,
            long pendingReview,
            long approved,
            long overridden,
            long rejected
    ) {}

    public record ConfidenceSentimentBuckets(
            long confidenceUnder55,
            long confidence55To75,
            long confidence75To90,
            long confidenceOver90,
            long narrowMargin,
            long clearMargin,
            long negativeSentiment,
            long neutralSentiment,
            long positiveSentiment
    ) {}

    public record DailyIntakeTrendPoint(
            String date,
            long intakeCount,
            long autoRoutedCount,
            long humanReviewedCount
    ) {}

    /** Legacy type name retained for API compatibility; values are fixed operational age bands. */
    public record SlaAgingBreakdown(
            long onTrack,
            long atRisk,
            long breached,
            long totalPending
    ) {}
}
