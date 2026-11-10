package ai.civicresolve.backend.exception;

/**
 * Thrown when an incoming tracking secret violates the required format specification
 * (e.g., does not match {@code ^trk_[A-Za-z0-9_-]{43}$}).
 *
 * <p>Produces an RFC 9457 400 Bad Request ProblemDetail.
 */
public class InvalidTrackingSecretFormatException extends RuntimeException {
    public InvalidTrackingSecretFormatException(String message) {
        super(message);
    }
}
