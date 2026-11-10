package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Append-only audit log record.
 *
 * <p>Every status change, approval, override, and rejection writes one record here.
 * The application role cannot UPDATE or DELETE audit history.
 * Actor identity is derived from Spring Security, not from the request body.
 */
@Entity
@Table(name = "audit_log")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false, nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "grievance_id", nullable = false, updatable = false)
    private Grievance grievance;

    /** Authenticated username performing the action. Never from the request body. */
    @Column(name = "actor", nullable = false, length = 100, updatable = false)
    private String actor;

    /** Action type: SUBMIT, APPROVE, OVERRIDE, REJECT. */
    @Column(name = "action", nullable = false, length = 20, updatable = false)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "previous_status", length = 20, updatable = false)
    private GrievanceStatus previousStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "new_status", length = 20, updatable = false)
    private GrievanceStatus newStatus;

    @Column(name = "previous_category", length = 120, updatable = false)
    private String previousCategory;

    @Column(name = "new_category", length = 120, updatable = false)
    private String newCategory;

    @Column(name = "previous_priority", length = 20, updatable = false)
    private String previousPriority;

    @Column(name = "new_priority", length = 20, updatable = false)
    private String newPriority;

    /** Required for OVERRIDE and REJECT actions; optional for APPROVE. */
    @Column(name = "review_note", columnDefinition = "TEXT", updatable = false)
    private String reviewNote;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected AuditLog() {}

    private AuditLog(Builder builder) {
        this.grievance = builder.grievance;
        this.actor = builder.actor;
        this.action = builder.action;
        this.previousStatus = builder.previousStatus;
        this.newStatus = builder.newStatus;
        this.previousCategory = builder.previousCategory;
        this.newCategory = builder.newCategory;
        this.previousPriority = builder.previousPriority;
        this.newPriority = builder.newPriority;
        this.reviewNote = builder.reviewNote;
        this.createdAt = builder.createdAt != null ? builder.createdAt : Instant.now();
    }

    // ─── Getters ────────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public Grievance getGrievance() { return grievance; }
    public String getActor() { return actor; }
    public String getAction() { return action; }
    public GrievanceStatus getPreviousStatus() { return previousStatus; }
    public GrievanceStatus getNewStatus() { return newStatus; }
    public String getPreviousCategory() { return previousCategory; }
    public String getNewCategory() { return newCategory; }
    public String getPreviousCategory_() { return previousCategory; }
    public String getPreviousPriority() { return previousPriority; }
    public String getNewPriority() { return newPriority; }
    public String getReviewNote() { return reviewNote; }
    public Instant getCreatedAt() { return createdAt; }

    // ─── Builder ─────────────────────────────────────────────────────────────

    public static Builder builder(Grievance grievance, String actor, String action) {
        return new Builder(grievance, actor, action);
    }

    public static final class Builder {
        private final Grievance grievance;
        private final String actor;
        private final String action;
        private GrievanceStatus previousStatus;
        private GrievanceStatus newStatus;
        private String previousCategory;
        private String newCategory;
        private String previousPriority;
        private String newPriority;
        private String reviewNote;
        private Instant createdAt;

        private Builder(Grievance grievance, String actor, String action) {
            this.grievance = grievance;
            this.actor = actor;
            this.action = action;
        }

        public Builder previousStatus(GrievanceStatus v) { this.previousStatus = v; return this; }
        public Builder newStatus(GrievanceStatus v) { this.newStatus = v; return this; }
        public Builder previousCategory(String v) { this.previousCategory = v; return this; }
        public Builder newCategory(String v) { this.newCategory = v; return this; }
        public Builder previousPriority(String v) { this.previousPriority = v; return this; }
        public Builder newPriority(String v) { this.newPriority = v; return this; }
        public Builder reviewNote(String v) { this.reviewNote = v; return this; }
        public Builder createdAt(Instant v) { this.createdAt = v; return this; }

        public AuditLog build() { return new AuditLog(this); }
    }
}
