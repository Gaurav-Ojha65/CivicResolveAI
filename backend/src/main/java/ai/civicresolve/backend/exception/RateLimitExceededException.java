package ai.civicresolve.backend.exception;

/**
 * Thrown when an IP-level rate limit, reference lockout threshold, or capacity ceiling is violated.
 *
 * <p>Produces an RFC 9457 429 Too Many Requests ProblemDetail.
 */
public class RateLimitExceededException extends RuntimeException {

    private final boolean capacitySaturated;

    public RateLimitExceededException(String message) {
        this(message, false);
    }

    public RateLimitExceededException(String message, boolean capacitySaturated) {
        super(message);
        this.capacitySaturated = capacitySaturated;
    }

    public boolean isCapacitySaturated() {
        return capacitySaturated;
    }
}
