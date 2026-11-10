package ai.civicresolve.backend.repository;

import ai.civicresolve.backend.entity.Grievance;
import ai.civicresolve.backend.entity.GrievanceStatus;
import ai.civicresolve.backend.entity.TriagePriority;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.UUID;

/**
 * Spring Data JPA repository for {@link Grievance}.
 * Runs as {@code civicresolve_app} — SELECT/INSERT/UPDATE only.
 */
@Repository
public interface GrievanceRepository extends JpaRepository<Grievance, UUID> {

    /**
     * Paginated list with optional filters and keyword/ID prefix search. NULL parameters are ignored.
     */
    @Query("""
            SELECT g FROM Grievance g
            WHERE (:status IS NULL OR g.status = :status)
              AND (:priority IS NULL OR g.priority = :priority)
              AND (:category IS NULL OR g.assignedCategory = :category)
              AND (:search IS NULL OR LOWER(CAST(g.id AS string)) LIKE LOWER(CONCAT(:search, '%')) OR LOWER(g.assignedCategory) LIKE LOWER(CONCAT('%', :search, '%')))
            ORDER BY g.submittedAt DESC
            """)
    Page<Grievance> findAll(
            @Param("status") GrievanceStatus status,
            @Param("priority") TriagePriority priority,
            @Param("category") String category,
            @Param("search") String search,
            Pageable pageable);

    /**
     * Paginated list with optional filters. NULL parameters are ignored.
     */
    @Query("""
            SELECT g FROM Grievance g
            WHERE (:status IS NULL OR g.status = :status)
              AND (:priority IS NULL OR g.priority = :priority)
              AND (:category IS NULL OR g.assignedCategory = :category)
            ORDER BY g.submittedAt DESC
            """)
    Page<Grievance> findAll(
            @Param("status") GrievanceStatus status,
            @Param("priority") TriagePriority priority,
            @Param("category") String category,
            Pageable pageable);

    /** Count by status for the stats endpoint. */
    long countByStatus(GrievanceStatus status);

    /** Count by priority for the stats endpoint. */
    long countByPriority(TriagePriority priority);

    /** Projection for Category Volume, Priority, and Workflow Status matrix. */
    interface CategoryPriorityVolumeProjection {
        String getCategory();
        long getTotal();
        long getCriticalCount();
        long getHighCount();
        long getMediumCount();
        long getLowCount();
        long getAutoRoutedCount();
        long getPendingReviewCount();
        long getApprovedCount();
        long getOverriddenCount();
        long getRejectedCount();
    }

    /**
     * Database-level group-by aggregation query computing the CFPB category volume & priority breakdown matrix.
     */
    @Query("SELECT g.assignedCategory AS category, " +
           "COUNT(g) AS total, " +
           "COALESCE(SUM(CASE WHEN g.priority = ai.civicresolve.backend.entity.TriagePriority.CRITICAL THEN 1L ELSE 0L END), 0L) AS criticalCount, " +
           "COALESCE(SUM(CASE WHEN g.priority = ai.civicresolve.backend.entity.TriagePriority.HIGH THEN 1L ELSE 0L END), 0L) AS highCount, " +
           "COALESCE(SUM(CASE WHEN g.priority = ai.civicresolve.backend.entity.TriagePriority.MEDIUM THEN 1L ELSE 0L END), 0L) AS mediumCount, " +
           "COALESCE(SUM(CASE WHEN g.priority = ai.civicresolve.backend.entity.TriagePriority.LOW THEN 1L ELSE 0L END), 0L) AS lowCount, " +
           "COALESCE(SUM(CASE WHEN g.status = ai.civicresolve.backend.entity.GrievanceStatus.AUTO_ROUTED THEN 1L ELSE 0L END), 0L) AS autoRoutedCount, " +
           "COALESCE(SUM(CASE WHEN g.status = ai.civicresolve.backend.entity.GrievanceStatus.PENDING_REVIEW THEN 1L ELSE 0L END), 0L) AS pendingReviewCount, " +
           "COALESCE(SUM(CASE WHEN g.status = ai.civicresolve.backend.entity.GrievanceStatus.APPROVED THEN 1L ELSE 0L END), 0L) AS approvedCount, " +
           "COALESCE(SUM(CASE WHEN g.status = ai.civicresolve.backend.entity.GrievanceStatus.OVERRIDDEN THEN 1L ELSE 0L END), 0L) AS overriddenCount, " +
           "COALESCE(SUM(CASE WHEN g.status = ai.civicresolve.backend.entity.GrievanceStatus.REJECTED THEN 1L ELSE 0L END), 0L) AS rejectedCount " +
           "FROM Grievance g " +
           "GROUP BY g.assignedCategory")
    java.util.List<CategoryPriorityVolumeProjection> countCategoryPriorityVolumeGrouped();

    /** Projection for queue SLA aging. */
    interface SlaAgingProjection {
        long getOnTrackCount();
        long getAtRiskCount();
        long getBreachedCount();
    }

    /**
     * Group-by query computing pending review SLA aging breakdown directly in SQL.
     */
    @Query("SELECT " +
           "COALESCE(SUM(CASE WHEN g.submittedAt >= :twentyFourHoursAgo THEN 1L ELSE 0L END), 0L) AS onTrackCount, " +
           "COALESCE(SUM(CASE WHEN g.submittedAt < :twentyFourHoursAgo AND g.submittedAt >= :seventyTwoHoursAgo THEN 1L ELSE 0L END), 0L) AS atRiskCount, " +
           "COALESCE(SUM(CASE WHEN g.submittedAt < :seventyTwoHoursAgo THEN 1L ELSE 0L END), 0L) AS breachedCount " +
           "FROM Grievance g WHERE g.status = ai.civicresolve.backend.entity.GrievanceStatus.PENDING_REVIEW")
    SlaAgingProjection countSlaAging(@Param("twentyFourHoursAgo") java.time.Instant twentyFourHoursAgo,
                                     @Param("seventyTwoHoursAgo") java.time.Instant seventyTwoHoursAgo);

    /** Lightweight projection for daily intake trends (status + timestamp only, no narrative text). */
    interface DailyStatusTimestampProjection {
        GrievanceStatus getStatus();
        java.time.Instant getSubmittedAt();
    }

    /**
     * Bounded query fetching recent human-adjudicated grievances for precedent ranking, excluding current id.
     */
    @Query("SELECT g FROM Grievance g WHERE g.status IN (ai.civicresolve.backend.entity.GrievanceStatus.APPROVED, ai.civicresolve.backend.entity.GrievanceStatus.OVERRIDDEN) AND g.id != :currentId ORDER BY g.updatedAt DESC")
    java.util.List<Grievance> findAdjudicatedCandidatesExcluding(@Param("currentId") UUID currentId, Pageable pageable);

    /**
     * Queries human-adjudicated grievances for active-learning export.
     */
    @Query("SELECT g FROM Grievance g WHERE g.status IN (ai.civicresolve.backend.entity.GrievanceStatus.APPROVED, ai.civicresolve.backend.entity.GrievanceStatus.OVERRIDDEN) AND (:onlyOverrides = false OR g.status = ai.civicresolve.backend.entity.GrievanceStatus.OVERRIDDEN) ORDER BY g.updatedAt DESC")
    java.util.List<Grievance> findForActiveLearningExport(@Param("onlyOverrides") boolean onlyOverrides);

    @Query("SELECT g.status AS status, g.submittedAt AS submittedAt " +
           "FROM Grievance g " +
           "WHERE g.submittedAt >= :since " +
           "ORDER BY g.submittedAt ASC")
    java.util.List<DailyStatusTimestampProjection> findDailyTimestampsSince(@Param("since") java.time.Instant since);
}
