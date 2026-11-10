package ai.civicresolve.backend.repository;

import ai.civicresolve.backend.entity.GrievanceTrackingCredential;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link GrievanceTrackingCredential}.
 *
 * <p>Application role {@code civicresolve_app} has SELECT, INSERT, UPDATE permissions.
 */
@Repository
public interface GrievanceTrackingCredentialRepository extends JpaRepository<GrievanceTrackingCredential, UUID> {

    /** Find tracking credentials by grievance ID. */
    Optional<GrievanceTrackingCredential> findByGrievanceId(UUID grievanceId);

    /**
     * Atomically increments lookup_count and updates last_accessed_at in a single SQL UPDATE.
     * Eliminates race conditions and lost increments under concurrent tracking lookups.
     *
     * @param grievanceId grievance UUID
     * @param lastAccessedAt timestamp of the successful lookup
     * @return count of updated rows
     */
    @Modifying
    @Query("UPDATE GrievanceTrackingCredential c SET c.lookupCount = c.lookupCount + 1, c.lastAccessedAt = :lastAccessedAt WHERE c.grievanceId = :grievanceId")
    int incrementLookupCount(@Param("grievanceId") UUID grievanceId, @Param("lastAccessedAt") Instant lastAccessedAt);
}
