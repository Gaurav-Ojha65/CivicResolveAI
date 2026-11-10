import { ProblemDetail, isProblemDetail } from '../../types/problem-detail';

/**
 * Normalized API error class wrapping HTTP failures and RFC 9457 Problem Details.
 *
 * Provides safe user-facing error messages while retaining diagnostic status codes
 * for deliberate UI error handling.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly problemDetail?: ProblemDetail;
  public readonly validationErrors?: string[];
  public readonly userMessage: string;

  constructor(
    status: number,
    statusText: string,
    problemDetail?: ProblemDetail,
    customUserMessage?: string
  ) {
    const safeMessage =
      customUserMessage ||
      ApiError.deriveUserMessage(status, statusText, problemDetail);

    super(safeMessage);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.problemDetail = problemDetail;
    this.userMessage = safeMessage;

    if (problemDetail?.errors && Array.isArray(problemDetail.errors)) {
      this.validationErrors = problemDetail.errors.map(String);
    }

    // Ensure proper prototype chain inheritance in transpiled environments
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Whether this error indicates authentication required (401).
   */
  public get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /**
   * Whether this error indicates access forbidden (403).
   */
  public get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * Whether this error is an auth failure (401 or 403).
   */
  public get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * Whether this error is a validation error (400).
   */
  public get isValidationError(): boolean {
    return this.status === 400;
  }

  /**
   * Whether this error is a resource not found error (404).
   */
  public get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * Whether this error is an optimistic locking / concurrent modification conflict (409).
   */
  public get isConflict(): boolean {
    return this.status === 409;
  }

  /**
   * Whether this error represents an upstream NLP microservice failure (502, 503, 504).
   */
  public get isUpstreamNlpError(): boolean {
    return this.status === 502 || this.status === 503 || this.status === 504;
  }

  /**
   * Derives a safe, clean, user-facing error message without leaking sensitive internal details.
   */
  private static deriveUserMessage(
    status: number,
    statusText: string,
    pd?: ProblemDetail
  ): string {
    // If a clean ProblemDetail detail exists and does not contain raw exception keywords
    if (pd?.detail && !ApiError.containsInternalLeak(pd.detail)) {
      return pd.detail;
    }

    switch (status) {
      case 400:
        return 'The request contains invalid input. Please check your data and try again.';
      case 401:
        return 'Authentication required. Please enter valid reviewer credentials.';
      case 403:
        return 'Access denied. You do not have permission to view or perform this action.';
      case 404:
        return 'The requested resource could not be found.';
      case 409:
        return 'The grievance was modified by another reviewer. Please refresh the page to view the latest updates.';
      case 502:
        return 'The automated classification service returned an unexpected response. Please try again.';
      case 503:
        return 'The automated classification service is temporarily unavailable. Please try again shortly.';
      case 504:
        return 'The automated classification service timed out. Please try again.';
      default:
        if (status >= 500) {
          return 'An unexpected server error occurred. Please try again later.';
        }
        return statusText || `Request failed with HTTP status ${status}.`;
    }
  }

  /**
   * Checks if an error detail string contains database, SQL, or Java exception leakage.
   */
  private static containsInternalLeak(text: string): boolean {
    const leakSignatures = [
      'sqlstate',
      'org.hibernate',
      'org.postgresql',
      'jakarta.persistence',
      'stacktrace',
      'syntax error at or near',
      'nullpointerexception',
    ];
    const lower = text.toLowerCase();
    return leakSignatures.some((sig) => lower.includes(sig));
  }

  /**
   * Parses an HTTP Response and body into an ApiError.
   */
  public static parse(response: Response, rawBody: unknown): ApiError {
    let pd: ProblemDetail | undefined;

    if (isProblemDetail(rawBody)) {
      pd = rawBody;
    } else if (typeof rawBody === 'string' && rawBody.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawBody);
        if (isProblemDetail(parsed)) {
          pd = parsed;
        }
      } catch {
        // Not a JSON ProblemDetail; treat rawBody as plain text
      }
    }

    return new ApiError(response.status, response.statusText, pd);
  }
}

