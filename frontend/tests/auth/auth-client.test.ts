import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authClient } from '../../src/features/auth/auth-client';
import { getInMemoryAuthHeader } from '../../src/lib/api/api-client';
import { ApiError } from '../../src/lib/errors/api-error';

describe('AuthClient (Strict In-Memory Basic Authentication)', () => {
  beforeEach(() => {
    authClient.logout();
    vi.restoreAllMocks();
  });

  it('starts unauthenticated with null user and null in-memory header', () => {
    expect(authClient.isAuthenticated()).toBe(false);
    expect(authClient.getCurrentUser()).toBeNull();
    expect(getInMemoryAuthHeader()).toBeNull();
  });

  it('authenticates reviewer against backend probe on valid credentials', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 10, pendingReview: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const listener = vi.fn();
    const unsubscribe = authClient.subscribe(listener);

    const user = await authClient.login('reviewer', 'secret-password');

    expect(user.username).toBe('reviewer');
    expect(user.role).toBe('ROLE_REVIEWER');
    expect(user.isAuthenticated).toBe(true);
    expect(authClient.isAuthenticated()).toBe(true);
    expect(authClient.getCurrentUser()?.username).toBe('reviewer');

    // In-memory header should be populated with Base64 Basic credentials
    const expectedEncoded = btoa('reviewer:secret-password');
    expect(getInMemoryAuthHeader()).toBe(`Basic ${expectedEncoded}`);

    // Listener was notified
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'reviewer', isAuthenticated: true })
    );

    unsubscribe();
  });

  it('clears in-memory credentials and throws ApiError when credentials are rejected (401)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    await expect(authClient.login('reviewer', 'wrong-pass')).rejects.toThrow(ApiError);

    expect(authClient.isAuthenticated()).toBe(false);
    expect(authClient.getCurrentUser()).toBeNull();
    expect(getInMemoryAuthHeader()).toBeNull();
  });

  it('clears credentials immediately on logout and notifies subscribers', async () => {
    // Authenticate first
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0 }), { status: 200 })
    );
    await authClient.login('reviewer', 'pass');
    expect(authClient.isAuthenticated()).toBe(true);

    const listener = vi.fn();
    authClient.subscribe(listener);

    // Logout
    authClient.logout();

    expect(authClient.isAuthenticated()).toBe(false);
    expect(authClient.getCurrentUser()).toBeNull();
    expect(getInMemoryAuthHeader()).toBeNull();
    expect(listener).toHaveBeenCalledWith(null);
  });

  it('STRICT SECURITY: Never writes credentials to localStorage or sessionStorage', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 0 }), { status: 200 })
    );

    await authClient.login('reviewer', 'super-secret-credentials');
    authClient.logout();

    expect(localStorageSpy).not.toHaveBeenCalled();
  });
});

