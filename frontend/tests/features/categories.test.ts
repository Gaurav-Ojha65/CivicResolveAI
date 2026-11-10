/**
 * categories.test.ts
 *
 * Unit tests for the getProductCategories API endpoint wrapper.
 * Mocks the underlying apiClient to validate parsing and error propagation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../../src/lib/errors/api-error';

// ── Mock apiClient ────────────────────────────────────────────────────────────
vi.mock('../../src/lib/api/api-client', () => ({
  apiClient: vi.fn(),
  setInMemoryAuthHeader: vi.fn(),
}));

import { apiClient } from '../../src/lib/api/api-client';
import { getProductCategories } from '../../src/lib/api/endpoints';

describe('getProductCategories', () => {
  beforeEach(() => {
    vi.mocked(apiClient).mockReset();
  });

  it('returns the parsed ProductCategoriesResponse on success', async () => {
    vi.mocked(apiClient).mockResolvedValue({
      categories: ['Credit card or prepaid card', 'Mortgage', 'Student loan'],
    });

    const result = await getProductCategories();

    expect(result.categories).toHaveLength(3);
    expect(result.categories).toContain('Mortgage');
  });

  it('returns an empty categories array when the API returns no categories', async () => {
    vi.mocked(apiClient).mockResolvedValue({ categories: [] });

    const result = await getProductCategories();
    expect(result.categories).toHaveLength(0);
  });

  it('calls apiClient with GET /api/product-categories and requiresAuth: false', async () => {
    vi.mocked(apiClient).mockResolvedValue({ categories: [] });

    await getProductCategories();

    expect(vi.mocked(apiClient)).toHaveBeenCalledWith(
      '/api/product-categories',
      expect.objectContaining({
        method: 'GET',
        requiresAuth: false,
      })
    );
  });

  it('propagates an ApiError when the server returns 503', async () => {
    vi.mocked(apiClient).mockRejectedValue(
      new ApiError(503, 'Service Unavailable')
    );

    await expect(getProductCategories()).rejects.toBeInstanceOf(ApiError);
  });

  it('propagates an AbortError when the request is cancelled', async () => {
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    vi.mocked(apiClient).mockRejectedValue(abortErr);

    const controller = new AbortController();
    controller.abort();

    let caught: Error | null = null;
    try {
      await getProductCategories(controller.signal);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.name).toBe('AbortError');
  });

  it('passes the provided AbortSignal to apiClient', async () => {
    vi.mocked(apiClient).mockResolvedValue({ categories: [] });

    const controller = new AbortController();
    await getProductCategories(controller.signal);

    expect(vi.mocked(apiClient)).toHaveBeenCalledWith(
      '/api/product-categories',
      expect.objectContaining({ signal: controller.signal })
    );
  });
});

