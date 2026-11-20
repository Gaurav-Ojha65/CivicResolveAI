package ai.civicresolve.backend.exception;

/**
 * Raised when a paginated request uses a negative page index or a non-positive page size.
 */
public class InvalidPaginationException extends RuntimeException {

    public InvalidPaginationException(String message) {
        super(message);
    }
}
