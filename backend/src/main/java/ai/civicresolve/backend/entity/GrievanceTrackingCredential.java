package ai.civicresolve.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Cryptographic tracking credential entity for anonymous public complaint tracking.
 *
 * <p>Never stores the raw tracking secret at rest. Stores only a cryptographically
 * salted SHA-256 hash and a per-complaint random salt.
 *
 * <p>Application role {@code civicresolve_app} has SELECT, INSERT, UPDATE on this table.
 */
@Entity
@Table(name = "grievance_tracking_credentials")
public class GrievanceTrackingCredential {

    @Id
    @Column(name = "grievance_id", nullable = false, updatable = false)
    private UUID grievanceId;

    /**
     * Salted SHA-256 hash (64 hex characters) of the raw tracking secret.
     * Raw secret is never persisted or logged.
     */
    @Column(name = "secret_hash", nullable = false, length = 64)
    private String secretHash;

    /**
     * Cryptographically secure 128-bit random salt (32 hex characters).
     */
    @Column(name = "salt", nullable = false, length = 32, updatable = false)
    private String salt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_accessed_at")
    private Instant lastAccessedAt;

    @Column(name = "lookup_count", nullable = false)
    private int lookupCount;

    protected GrievanceTrackingCredential() {}

    public GrievanceTrackingCredential(UUID grievanceId, String secretHash, String salt) {
        this.grievanceId = grievanceId;
        this.secretHash = secretHash;
        this.salt = salt;
        this.createdAt = Instant.now();
        this.lookupCount = 0;
    }

    // ─── Getters ────────────────────────────────────────────────────────────

    public UUID getGrievanceId() { return grievanceId; }
    public String getSecretHash() { return secretHash; }
    public String getSalt() { return salt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getLastAccessedAt() { return lastAccessedAt; }
    public int getLookupCount() { return lookupCount; }

    // ─── Mutators ───────────────────────────────────────────────────────────

    public void recordSuccessfulLookup(Instant accessTime) {
        this.lastAccessedAt = accessTime;
        this.lookupCount++;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
