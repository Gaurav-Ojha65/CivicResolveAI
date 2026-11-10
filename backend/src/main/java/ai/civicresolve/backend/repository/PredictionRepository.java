package ai.civicresolve.backend.repository;

import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.Prediction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link Prediction}.
 * Application role has SELECT/INSERT only — no UPDATE or DELETE.
 */
@Repository
public interface PredictionRepository extends JpaRepository<Prediction, Long> {

    /** Fetch the original prediction for a grievance (one-to-one relationship). */
    Optional<Prediction> findByGrievanceId(UUID grievanceId);

    /** Projection for grouped adjudication counts (confusion matrix & override distribution). */
    interface AdjudicationGroupCount {
        String getPredictedCategory();
        String getAssignedCategory();
        GrievanceStatus getStatus();
        long getCount();
    }

    /** Projection for review safety trigger volume. */
    interface TriggerCounts {
        Long getLowConfidenceCount();
        Long getSmallMarginCount();
        Long getCriticalPriorityCount();
        Long getAutoRoutedCount();
    }

    /**
     * Group-by aggregation query computing adjudication outcome counts directly in PostgreSQL.
     * Prevents loading Prediction and Grievance narrative text into JVM memory.
     */
    @Query("SELECT p.predictedCategory AS predictedCategory, " +
           "g.assignedCategory AS assignedCategory, " +
           "g.status AS status, " +
           "COUNT(p) AS count " +
           "FROM Prediction p JOIN p.grievance g " +
           "WHERE g.status IN (ai.civicresolve.backend.entity.GrievanceStatus.APPROVED, ai.civicresolve.backend.entity.GrievanceStatus.OVERRIDDEN) " +
           "GROUP BY p.predictedCategory, g.assignedCategory, g.status")
    List<AdjudicationGroupCount> countAdjudicationsGrouped();

    /**
     * Database-level conditional aggregation query computing triage trigger counts directly.
     */
    @Query("SELECT " +
           "COALESCE(SUM(CASE WHEN p.confidence < 0.55 THEN 1L ELSE 0L END), 0L) AS lowConfidenceCount, " +
           "COALESCE(SUM(CASE WHEN p.margin < 0.15 THEN 1L ELSE 0L END), 0L) AS smallMarginCount, " +
           "COALESCE(SUM(CASE WHEN UPPER(p.triagePriority) = 'CRITICAL' THEN 1L ELSE 0L END), 0L) AS criticalPriorityCount, " +
           "COALESCE(SUM(CASE WHEN p.flagForReview = false OR g.status = ai.civicresolve.backend.entity.GrievanceStatus.AUTO_ROUTED THEN 1L ELSE 0L END), 0L) AS autoRoutedCount " +
           "FROM Prediction p JOIN p.grievance g")
    TriggerCounts countTriggers();

    /** Projection for confidence calibration and decision margin bands. */
    interface ConfidenceMarginBandsProjection {
        long getConfidenceUnder55();
        long getConfidence55To75();
        long getConfidence75To90();
        long getConfidenceOver90();
        long getNarrowMarginCount();
        long getClearMarginCount();
    }

    /**
     * Group-by query computing uncalibrated confidence bands and decision margin distribution directly in SQL.
     */
    @Query("SELECT " +
           "COALESCE(SUM(CASE WHEN p.confidence < 0.55 THEN 1L ELSE 0L END), 0L) AS confidenceUnder55, " +
           "COALESCE(SUM(CASE WHEN p.confidence >= 0.55 AND p.confidence < 0.75 THEN 1L ELSE 0L END), 0L) AS confidence55To75, " +
           "COALESCE(SUM(CASE WHEN p.confidence >= 0.75 AND p.confidence < 0.90 THEN 1L ELSE 0L END), 0L) AS confidence75To90, " +
           "COALESCE(SUM(CASE WHEN p.confidence >= 0.90 THEN 1L ELSE 0L END), 0L) AS confidenceOver90, " +
           "COALESCE(SUM(CASE WHEN p.margin < 0.15 THEN 1L ELSE 0L END), 0L) AS narrowMarginCount, " +
           "COALESCE(SUM(CASE WHEN p.margin >= 0.15 THEN 1L ELSE 0L END), 0L) AS clearMarginCount " +
           "FROM Prediction p")
    ConfidenceMarginBandsProjection countConfidenceMarginBands();
}
