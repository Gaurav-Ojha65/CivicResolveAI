import { ApiError } from '../errors/api-error';
import { ApiRequestOptions } from '../../types/api';

/**
 * Module-level in-memory credentials store.
 * STRICT SECURITY REQUIREMENT:
 * Never persisted in localStorage, sessionStorage, cookies, or indexedDB.
 * Cleared immediately on page refresh or explicit logout.
 */
let inMemoryAuthHeader: string | null = null;

/**
 * Configure or clear the in-memory Authorization header.
 *
 * @param header - Formatted Authorization header (e.g. 'Basic ...') or null to clear.
 */
export function setInMemoryAuthHeader(header: string | null): void {
  inMemoryAuthHeader = header;
}

/**
 * Read the active in-memory Authorization header.
 */
export function getInMemoryAuthHeader(): string | null {
  return inMemoryAuthHeader;
}

/**
 * Resolves the API base URL from Vite environment variables.
 * Defaults to empty string so requests target relative '/api' via Vite development proxy.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    // Strip trailing slashes
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

/**
 * Build URL with optional query search parameters.
 */
export function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const fullUrl = `${baseUrl}${cleanPath}`;

  if (!params) {
    return fullUrl;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const query = searchParams.toString();
  return query ? `${fullUrl}?${query}` : fullUrl;
}

/**
 * Centralized typed API client communicating exclusively with Spring Boot REST API.
 *
 * Features:
 * - Environment-configurable base URL (with Vite proxy default)
 * - Safe JSON serialization & parsing
 * - Automatic in-memory Authorization header injection for protected endpoints
 * - Standard 'X-Requested-With' header to suppress native browser basic auth prompts
 * - Request cancellation support via AbortSignal
 * - RFC 9457 ProblemDetail normalization through ApiError
 * - Zero logging of sensitive credentials or auth headers
 */
export async function apiClient<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    params,
    requiresAuth = false,
    headers: customHeaders,
    signal,
    ...restOptions
  } = options;

  const url = buildUrl(path, params);

  const headers = new Headers(customHeaders);
  headers.set('Accept', 'application/json');

  // Suppress browser native credential dialog on 401 Basic responses
  headers.set('X-Requested-With', 'XMLHttpRequest');

  // Inject in-memory authorization header only on endpoints that require authentication
  if (inMemoryAuthHeader && requiresAuth) {
    headers.set('Authorization', inMemoryAuthHeader);
  }

  let serializedBody: string | undefined;
  if (body !== undefined && body !== null) {
    headers.set('Content-Type', 'application/json');
    serializedBody = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: serializedBody,
      signal,
      ...restOptions,
    });
  } catch (err: unknown) {
    if (
      signal?.aborted ||
      (err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.toLowerCase().includes('abort')))
    ) {
      throw err;
    }
    // Network errors (e.g. server offline or connection refused)
    throw new ApiError(
      0,
      'Network Error',
      undefined,
      'Unable to connect to the server. Please verify network connectivity.'
    );
  }

  // Handle successful empty response (e.g. 204 No Content)
  if (response.status === 204) {
    return null as T;
  }

  // Parse response body safely
  const responseContentType = response.headers.get('content-type') || '';
  const isJson = responseContentType.includes('application/json') ||
                 responseContentType.includes('application/problem+json');

  let rawBody: unknown;
  try {
    if (isJson) {
      rawBody = await response.json();
    } else {
      rawBody = await response.text();
    }
  } catch {
    rawBody = null;
  }

  if (!response.ok) {
    throw ApiError.parse(response, rawBody);
  }

  return rawBody as T;
}

