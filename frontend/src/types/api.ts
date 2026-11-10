import { ProblemDetail } from './problem-detail';

/**
 * Standard request options for the CivicResolve API client.
 */
export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  /** Optional JSON serializable body */
  body?: unknown;
  /** Optional URL search query parameters */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Explicitly flag whether this endpoint requires reviewer authentication */
  requiresAuth?: boolean;
}

/**
 * Query parameters for Spring Data Pageable endpoints.
 */
export interface PageableParams {
  page?: number;
  size?: number;
  sort?: string;
}

/**
 * In-memory authenticated user context.
 */
export interface AuthUser {
  username: string;
  role: string;
  isAuthenticated: boolean;
}

export type { ProblemDetail };

