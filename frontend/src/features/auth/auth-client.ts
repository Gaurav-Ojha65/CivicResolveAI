import { AuthUser } from '../../types/api';
import { setInMemoryAuthHeader } from '../../lib/api/api-client';
import { ApiError } from '../../lib/errors/api-error';

type AuthListener = (user: AuthUser | null) => void;

class AuthClient {
  private currentUser: AuthUser | null = null;
  private listeners: Set<AuthListener> = new Set();

  /**
   * Returns current authenticated user context or null.
   */
  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  /**
   * Whether there is an active authenticated in-memory session.
   */
  public isAuthenticated(): boolean {
    return this.currentUser !== null && this.currentUser.isAuthenticated;
  }

  /**
   * Subscribe to in-memory authentication state changes.
   *
   * @param listener Callback invoked when authentication status changes.
   * @returns Unsubscribe cleanup function.
   */
  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentUser);
      } catch (err) {
        // Suppress listener callback errors from disrupting auth client
        console.error('Error in auth state listener', err);
      }
    }
  }

  /**
   * Authenticate reviewer using in-memory HTTP Basic credentials.
   * Validates credentials against Spring Boot /api/auth/me identity endpoint.
   *
   * Security Notice:
   * Credentials are never written to localStorage, sessionStorage, or cookies.
   */
  public async login(
    username: string,
    rawPassword: string,
    signal?: AbortSignal
  ): Promise<AuthUser> {
    if (!username || !username.trim()) {
      throw new ApiError(400, 'Bad Request', undefined, 'Username is required.');
    }
    if (!rawPassword) {
      throw new ApiError(400, 'Bad Request', undefined, 'Password is required.');
    }

    // Standard HTTP Basic base64 credential encoding
    const encoded = btoa(`${username.trim()}:${rawPassword}`);
    const basicHeader = `Basic ${encoded}`;

    // Temporarily set the in-memory header to test credentials
    setInMemoryAuthHeader(basicHeader);

    try {
      // Validate credentials against Spring Boot backend /api/auth/me identity endpoint
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
      const cleanBase = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
      const probeUrl = `${cleanBase}/api/auth/me`;

      const response = await fetch(probeUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: basicHeader,
          'X-Requested-With': 'XMLHttpRequest',
        },
        signal,
      });

      if (!response.ok) {
        // Clear in-memory header on rejection
        setInMemoryAuthHeader(null);
        let errorBody: unknown = null;
        try {
          errorBody = await response.json();
        } catch {
          // Non-JSON response
        }
        throw ApiError.parse(response, errorBody);
      }

      let responseBody: any = null;
      try {
        responseBody = await response.json();
      } catch {
        // Non-JSON response
      }

      // Credentials verified — populate authenticated user
      this.currentUser = {
        username: (responseBody && responseBody.username) ? responseBody.username : username.trim(),
        role: (responseBody && Array.isArray(responseBody.roles) && responseBody.roles.length > 0)
          ? responseBody.roles[0]
          : 'ROLE_REVIEWER',
        isAuthenticated: true,
      };

      this.notify();
      return this.currentUser;
    } catch (err) {
      // Clear credentials on any exception
      setInMemoryAuthHeader(null);
      this.currentUser = null;
      this.notify();
      throw err;
    }
  }

  /**
   * Log out the current user by clearing in-memory credentials immediately.
   */
  public logout(): void {
    setInMemoryAuthHeader(null);
    this.currentUser = null;
    this.notify();
  }
}

export const authClient = new AuthClient();
