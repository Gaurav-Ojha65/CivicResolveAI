import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setInMemoryAuthHeader } from '../../src/lib/api/api-client';
import {
  getHealth,
  getProductCategories,
  submitGrievance,
  listGrievances,
  getGrievanceById,
  reviewGrievance,
  getGrievanceStats,
} from '../../src/lib/api/endpoints';
import { ApiError } from '../../src/lib/errors/api-error';

describe('Centralized API Client and Endpoints', () => {
  beforeEach(() => {
    setInMemoryAuthHeader(null);
    vi.restoreAllMocks();
  });

  it('successfully fetches health probe from GET /api/health', async () => {
    const mockHealth = {
      status: 'ok',
      service: 'civicresolve-backend',
      timestamp_utc: '2026-10-30T09:00:00Z',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockHealth), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await getHealth();
    expect(result).toEqual(mockHealth);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
      })
    );
  });

  it('successfully fetches product categories from GET /api/product-categories', async () => {
    const mockCategories = {
      categories: ['Credit Card', 'Checking or Savings Account', 'Mortgage'],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockCategories), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await getProductCategories();
    expect(result.categories).toHaveLength(3);
  });

  it('submits a public grievance via POST /api/grievances with serialized JSON body', async () => {
    const mockResponse = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      assignedCategory: 'Credit Card',
      priority: 'MEDIUM',
      status: 'AUTO_ROUTED',
      reviewRequired: false,
      submittedAt: '2026-10-30T09:00:00Z',
      updatedAt: '2026-10-30T09:00:00Z',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const requestPayload = {
      description: 'Unauthorized recurring fee appeared on monthly credit card statement.',
    };

    const result = await submitGrievance(requestPayload);

    expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/grievances',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(requestPayload),
      })
    );
  });

  it('injects in-memory Authorization header on protected endpoints', async () => {
    setInMemoryAuthHeader('Basic cmV2aWV3ZXI6c2VjcmV0');

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      const headers = init?.headers as Headers;
      expect(headers.get('Authorization')).toBe('Basic cmV2aWV3ZXI6c2VjcmV0');
      expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');

      return new Response(
        JSON.stringify({
          content: [],
          totalElements: 0,
          totalPages: 0,
          size: 20,
          number: 0,
          first: true,
          last: true,
          empty: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await listGrievances({ page: 0, size: 20 });
    expect(result.empty).toBe(true);
  });

  it('sends PATCH /api/grievances/{id}/review with review decision payload', async () => {
    setInMemoryAuthHeader('Basic cmV2aWV3ZXI6c2VjcmV0');

    const grievanceId = '123e4567-e89b-12d3-a456-426614174000';
    const mockReviewed = {
      id: grievanceId,
      assignedCategory: 'Mortgage',
      priority: 'HIGH',
      status: 'APPROVED',
      reviewRequired: true,
      submittedAt: '2026-10-30T09:00:00Z',
      updatedAt: '2026-10-30T09:10:00Z',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockReviewed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const reviewPayload = {
      action: 'APPROVE' as const,
      reviewNote: 'Routing confirmed based on supporting loan documents.',
      expectedVersion: 0,
    };

    const result = await reviewGrievance(grievanceId, reviewPayload);

    expect(result.status).toBe('APPROVED');
    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/grievances/${grievanceId}/review`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify(reviewPayload),
      })
    );
  });

  it('throws ApiError with validation details on HTTP 400 Bad Request', async () => {
    const errorProblemDetail = {
      type: 'https://civicresolve.ai/errors/validation',
      title: 'Validation Failed',
      status: 400,
      detail: 'One or more fields failed validation.',
      errors: ['description: Description must not be blank.'],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(errorProblemDetail), {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );

    await expect(submitGrievance({ description: '' })).rejects.toThrow(ApiError);
  });

  it('throws ApiError on HTTP 401 Unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 401, statusText: 'Unauthorized' })
    );

    try {
      await getGrievanceStats();
      expect.unreachable('Should have thrown ApiError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.isUnauthorized).toBe(true);
    }
  });

  it('throws ApiError on HTTP 403 Forbidden', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 403, statusText: 'Forbidden' })
    );

    try {
      await getGrievanceById('123e4567-e89b-12d3-a456-426614174000');
      expect.unreachable('Should have thrown ApiError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(403);
      expect(apiErr.isForbidden).toBe(true);
    }
  });

  it('throws ApiError on HTTP 409 Concurrent Modification Conflict', async () => {
    const conflictPd = {
      type: 'https://civicresolve.ai/errors/conflict',
      title: 'Concurrent Modification Conflict',
      status: 409,
      detail:
        'The grievance was updated by another transaction. Please refresh and try again.',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(conflictPd), {
        status: 409,
        headers: { 'Content-Type': 'application/problem+json' },
      })
    );

    try {
      await reviewGrievance('123e4567-e89b-12d3-a456-426614174000', {
        action: 'APPROVE',
        expectedVersion: 0,
      });
      expect.unreachable('Should have thrown ApiError');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.isConflict).toBe(true);
      expect(apiErr.userMessage).toContain('The grievance was updated by another transaction');
    }
  });

  it('aborts request when AbortSignal is cancelled', async () => {
    const controller = new AbortController();
    controller.abort();

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new DOMException('The user aborted a request.', 'AbortError')
    );

    try {
      await getHealth(controller.signal);
      expect.unreachable('Should have aborted');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  // ── Authorization header segregation regression tests ─────────────────────

  it('Authorization header is NOT sent on public endpoints when inMemoryAuthHeader is set', async () => {
    setInMemoryAuthHeader('Basic cmV2aWV3ZXI6c2VjcmV0');

    let capturedHeaders: Headers | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedHeaders = init?.headers as Headers;
      return new Response(
        JSON.stringify({ categories: ['Credit Card'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    // getProductCategories uses requiresAuth: false
    await getProductCategories();

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get('Authorization')).toBeNull();
  });

  it('Authorization header IS sent on protected endpoints when inMemoryAuthHeader is set', async () => {
    setInMemoryAuthHeader('Basic cmV2aWV3ZXI6c2VjcmV0');

    let capturedHeaders: Headers | null = null;

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
      capturedHeaders = init?.headers as Headers;
      return new Response(
        JSON.stringify({
          content: [],
          totalElements: 0,
          totalPages: 0,
          size: 20,
          number: 0,
          first: true,
          last: true,
          empty: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    // listGrievances uses requiresAuth: true
    await listGrievances({ page: 0, size: 20 });

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get('Authorization')).toBe('Basic cmV2aWV3ZXI6c2VjcmV0');
  });
});
