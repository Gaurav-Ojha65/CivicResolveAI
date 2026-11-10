package ai.civicresolve.backend.exception;

/**
 * Thrown when a tracking lookup fails due to non-existent reference ID, missing credentials,
 * or mismatched tracking secret.
 *
 * <p>Produces a generic RFC 9457 404 ProblemDetail to eliminate UUID enumeration.
 */
public class TrackingNotFoundException extends RuntimeException {
    public TrackingNotFoundException() {
        super("No complaint matches the provided reference ID and tracking secret.");
    }

    public TrackingNotFoundException(String message) {
        super(message);
    }
}
