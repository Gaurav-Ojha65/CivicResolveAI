package ai.civicresolve.backend.exception;

import ai.civicresolve.backend.service.NlpClientService;
import jakarta.persistence.OptimisticLockException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Global exception handler producing RFC 9457 Problem Details responses.
 *
 * <p>Security: stack traces, internal database details, and sensitive data are
 * never included in public HTTP responses. Only safe, user-facing messages are returned.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final URI VALIDATION_TYPE = URI.create("https://civicresolve.ai/errors/validation");
    private static final URI NOT_FOUND_TYPE = URI.create("https://civicresolve.ai/errors/not-found");
    private static final URI REVIEW_STATE_TYPE = URI.create("https://civicresolve.ai/errors/invalid-review-state");
    private static final URI CONFLICT_TYPE = URI.create("https://civicresolve.ai/errors/conflict");
    private static final URI NLP_TYPE = URI.create("https://civicresolve.ai/errors/nlp-service");
    private static final URI RATE_LIMIT_TYPE = URI.create("https://civicresolve.ai/errors/rate-limit-exceeded");
    private static final URI INTERNAL_TYPE = URI.create("https://civicresolve.ai/errors/internal");

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        List<String> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                .collect(Collectors.toList());

        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setType(VALIDATION_TYPE);
        pd.setTitle("Validation Failed");
        pd.setDetail("One or more fields failed validation.");
        pd.setProperty("errors", fieldErrors);
        return pd;
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail handleNotReadable(HttpMessageNotReadableException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setType(VALIDATION_TYPE);
        pd.setTitle("Malformed Request");
        pd.setDetail("The request payload contains invalid or malformed data.");
        return pd;
    }

    @ExceptionHandler(InvalidTrackingSecretFormatException.class)
    public ProblemDetail handleInvalidTrackingSecretFormat(InvalidTrackingSecretFormatException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        pd.setType(VALIDATION_TYPE);
        pd.setTitle("Invalid Tracking Secret Format");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(GrievanceNotFoundException.class)
    public ProblemDetail handleNotFound(GrievanceNotFoundException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        pd.setType(NOT_FOUND_TYPE);
        pd.setTitle("Grievance Not Found");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(TrackingNotFoundException.class)
    public ProblemDetail handleTrackingNotFound(TrackingNotFoundException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        pd.setType(NOT_FOUND_TYPE);
        pd.setTitle("Grievance Not Found");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    public static final String FIXED_RATE_LIMIT_DETAIL = "Too many requests. Please try again later.";

    @ExceptionHandler(RateLimitExceededException.class)
    public ProblemDetail handleRateLimitExceeded(RateLimitExceededException ex) {
        log.warn("Rate limit exceeded: message={}, capacitySaturated={}",
                ex.getMessage(), ex.isCapacitySaturated());
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.TOO_MANY_REQUESTS);
        pd.setType(RATE_LIMIT_TYPE);
        pd.setTitle("Too Many Requests");
        pd.setDetail(FIXED_RATE_LIMIT_DETAIL);
        return pd;
    }

    @ExceptionHandler(InvalidReviewStateException.class)
    public ProblemDetail handleInvalidReview(InvalidReviewStateException ex) {
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setType(REVIEW_STATE_TYPE);
        pd.setTitle("Invalid Review State");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(StaleGrievanceVersionException.class)
    public ProblemDetail handleStaleVersion(StaleGrievanceVersionException ex) {
        log.warn("Browser-level version conflict for grievance {}: expected={}, current={}",
                ex.getGrievanceId(), ex.getExpectedVersion(), ex.getCurrentVersion());
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setType(CONFLICT_TYPE);
        pd.setTitle("Concurrent Modification Conflict");
        pd.setDetail("The grievance was updated by another reviewer. Please refresh and try again.");
        return pd;
    }

    @ExceptionHandler({
            OptimisticLockingFailureException.class,
            OptimisticLockException.class
    })
    public ProblemDetail handleOptimisticLock(Exception ex) {
        log.warn("Optimistic locking conflict detected: {}", ex.getMessage());
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.CONFLICT);
        pd.setType(CONFLICT_TYPE);
        pd.setTitle("Concurrent Modification Conflict");
        pd.setDetail("The grievance was updated by another transaction. Please refresh and try again.");
        return pd;
    }

    @ExceptionHandler(NlpClientService.NlpClientException.class)
    public ProblemDetail handleNlpClientException(NlpClientService.NlpClientException ex) {
        HttpStatus status = switch (ex.getHttpStatus()) {
            case 400 -> HttpStatus.BAD_REQUEST;
            case 502 -> HttpStatus.BAD_GATEWAY;
            case 503 -> HttpStatus.SERVICE_UNAVAILABLE;
            case 504 -> HttpStatus.GATEWAY_TIMEOUT;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        ProblemDetail pd = ProblemDetail.forStatus(status);
        pd.setType(NLP_TYPE);
        pd.setTitle("NLP Service Error");
        pd.setDetail(ex.getMessage());
        return pd;
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public void handleAccessDenied(org.springframework.security.access.AccessDeniedException ex) {
        // Re-throw so Spring Security's ExceptionTranslationFilter / ProblemDetailAccessDeniedHandler handles it as 403 ProblemDetail
        throw ex;
    }

    @ExceptionHandler(org.springframework.security.core.AuthenticationException.class)
    public void handleAuthentication(org.springframework.security.core.AuthenticationException ex) {
        // Re-throw so Spring Security's ExceptionTranslationFilter / ProblemDetailAuthEntryPoint handles it as 401 ProblemDetail
        throw ex;
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail handleUnexpected(Exception ex) {
        // Log with correlation but never expose internals to caller
        log.error("Unexpected error: {}", ex.getClass().getSimpleName(), ex);
        ProblemDetail pd = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
        pd.setType(INTERNAL_TYPE);
        pd.setTitle("Internal Server Error");
        pd.setDetail("An unexpected error occurred. Please try again later.");
        return pd;
    }
}
