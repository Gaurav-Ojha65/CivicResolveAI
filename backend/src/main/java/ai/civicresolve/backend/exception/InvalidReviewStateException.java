package ai.civicresolve.backend.exception;

/** Thrown when a review action is invalid for the current grievance state. */
public class InvalidReviewStateException extends RuntimeException {
    public InvalidReviewStateException(String message) {
        super(message);
    }
}
