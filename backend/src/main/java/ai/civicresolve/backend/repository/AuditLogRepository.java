package ai.civicresolve.backend.repository;

import ai.civicresolve.backend.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link AuditLog}.
 * Application role has SELECT/INSERT only — no UPDATE or DELETE.
 */
@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {

    /** Full audit trail for a specific grievance, ordered oldest-first. */
    List<AuditLog> findByGrievanceIdOrderByCreatedAtAsc(UUID grievanceId);

    /** Full audit trail for a specific grievance with deterministic ordering by created_at and id. */
    List<AuditLog> findByGrievanceIdOrderByCreatedAtAscIdAsc(UUID grievanceId);
}
