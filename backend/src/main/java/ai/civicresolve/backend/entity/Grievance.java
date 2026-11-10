package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

/**
 * Persistent grievance case record.
 *
 * <p>The {@code narrative} column stores the original complaint text as submitted.
 * It is the only field passed to the FastAPI NLP service.
 *
 * <p>Application role {@code civicresolve_app} has SELECT/INSERT/UPDATE on this table.
 */
@Entity
@Table(name = "grievances")
public class Grievance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /**
     * Original complaint narrative as submitted by the citizen.
     * This is the sole input to the NLP classification service.
     * Never log or expose in public error messages.
     */
    @Column(name = "narrative", nullable = false, columnDefinition = "TEXT")
    private String narrative;

    /**
     * Current product category assignment (may be overridden by a reviewer).
     */
    @Column(name = "assigned_category", nullable = false, length = 120)
    private String assignedCategory;

    /**
     * Current triage priority (may be overridden by a reviewer).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "priority", nullable = false, length = 20)
    private TriagePriority priority;

    /**
     * Current workflow status.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private GrievanceStatus status;

    /**
     * Whether this case requires human review (from FastAPI dual-trigger logic).
     */
    @Column(name = "review_required", nullable = false)
    private boolean reviewRequired;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /**
     * JPA optimistic locking version counter.
     */
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    protected Grievance() {}

    public Grievance(String narrative,
                     String assignedCategory,
                     TriagePriority priority,
                     GrievanceStatus status,
                     boolean reviewRequired) {
        this.narrative = narrative;
        this.assignedCategory = assignedCategory;
        this.priority = priority;
        this.status = status;
        this.reviewRequired = reviewRequired;
        Instant now = Instant.now();
        this.submittedAt = now;
        this.updatedAt = now;
    }

    // ─── Getters ────────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public String getNarrative() { return narrative; }
    public String getAssignedCategory() { return assignedCategory; }
    public TriagePriority getPriority() { return priority; }
    public GrievanceStatus getStatus() { return status; }
    public boolean isReviewRequired() { return reviewRequired; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Long getVersion() { return version; }

    // ─── Setters (only mutable fields) ──────────────────────────────────────

    public void setAssignedCategory(String assignedCategory) {
        this.assignedCategory = assignedCategory;
        this.updatedAt = Instant.now();
    }

    public void setPriority(TriagePriority priority) {
        this.priority = priority;
        this.updatedAt = Instant.now();
    }

    public void setStatus(GrievanceStatus status) {
        this.status = status;
        this.updatedAt = Instant.now();
    }

    public void setReviewRequired(boolean reviewRequired) {
        this.reviewRequired = reviewRequired;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }
}
