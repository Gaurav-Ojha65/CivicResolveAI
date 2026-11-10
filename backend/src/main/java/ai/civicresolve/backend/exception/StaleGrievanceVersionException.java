package ai.civicresolve.backend.exception;

import java.util.UUID;

/**
 * Thrown when a reviewer submits a review with an {@code expectedVersion} that does not match
 * the grievance's current JPA {@code @Version} counter.
 *
 * <p>This implements browser-level optimistic locking: the client reads
 * {@code GrievanceDetailResponse.version}, echoes it back in {@code ReviewRequest.expectedVersion},
 * and the server rejects stale submissions before any database write is attempted.
 *
 * <p>Handled by {@link GlobalExceptionHandler} as HTTP 409 Conflict (RFC 9457 ProblemDetail).
 */
public class StaleGrievanceVersionException extends RuntimeException {

    private final UUID grievanceId;
    private final long expectedVersion;
    private final long currentVersion;

    public StaleGrievanceVersionException(UUID grievanceId, long expectedVersion, long currentVersion) {
        super(String.format(
                "Grievance %s has been modified. Expected version %d but current version is %d. "
                + "Please refresh the grievance and try again.",
                grievanceId, expectedVersion, currentVersion));
        this.grievanceId = grievanceId;
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
    }

    public UUID getGrievanceId() { return grievanceId; }
    public long getExpectedVersion() { return expectedVersion; }
    public long getCurrentVersion() { return currentVersion; }
}
