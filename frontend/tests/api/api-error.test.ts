import { describe, it, expect } from 'vitest';
import { ApiError } from '../../src/lib/errors/api-error';
import { ProblemDetail } from '../../src/types/problem-detail';

describe('ApiError and ProblemDetail Parser', () => {
  it('parses RFC 9457 ProblemDetail on HTTP 400 validation failure', () => {
    const pd: ProblemDetail = {
      type: 'https://civicresolve.ai/errors/validation',
      title: 'Validation Failed',
      status: 400,
      detail: 'One or more fields failed validation.',
      errors: [
        'description: Description must be between 10 and 5000 characters.',
      ],
    };

    const mockResponse = new Response(JSON.stringify(pd), {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'Content-Type': 'application/problem+json' },
    });

    const error = ApiError.parse(mockResponse, pd);

    expect(error.status).toBe(400);
    expect(error.isValidationError).toBe(true);
    expect(error.userMessage).toBe('One or more fields failed validation.');
    expect(error.validationErrors).toEqual([
      'description: Description must be between 10 and 5000 characters.',
    ]);
  });

  it('correctly identifies HTTP 401 Unauthorized', () => {
    const mockResponse = new Response(null, {
      status: 401,
      statusText: 'Unauthorized',
    });

    const error = ApiError.parse(mockResponse, null);

    expect(error.status).toBe(401);
    expect(error.isUnauthorized).toBe(true);
    expect(error.isAuthError).toBe(true);
    expect(error.userMessage).toContain('Authentication required');
  });

  it('correctly identifies HTTP 403 Forbidden', () => {
    const mockResponse = new Response(null, {
      status: 403,
      statusText: 'Forbidden',
    });

    const error = ApiError.parse(mockResponse, null);

    expect(error.status).toBe(403);
    expect(error.isForbidden).toBe(true);
    expect(error.isAuthError).toBe(true);
    expect(error.userMessage).toContain('Access denied');
  });

  it('correctly identifies HTTP 409 Concurrent Modification Conflict', () => {
    const pd: ProblemDetail = {
      type: 'https://civicresolve.ai/errors/conflict',
      title: 'Concurrent Modification Conflict',
      status: 409,
      detail:
        'The grievance was updated by another transaction. Please refresh and try again.',
    };

    const mockResponse = new Response(JSON.stringify(pd), {
      status: 409,
      statusText: 'Conflict',
    });

    const error = ApiError.parse(mockResponse, pd);

    expect(error.status).toBe(409);
    expect(error.isConflict).toBe(true);
    expect(error.userMessage).toContain('The grievance was updated by another transaction');
  });

  it('identifies upstream NLP service failures (502, 503, 504)', () => {
    const pd503: ProblemDetail = {
      type: 'https://civicresolve.ai/errors/nlp-service',
      title: 'NLP Service Error',
      status: 503,
      detail: 'Upstream NLP classification service is unavailable.',
    };

    const mockResponse = new Response(JSON.stringify(pd503), {
      status: 503,
      statusText: 'Service Unavailable',
    });

    const error = ApiError.parse(mockResponse, pd503);

    expect(error.status).toBe(503);
    expect(error.isUpstreamNlpError).toBe(true);
  });

  it('sanitizes potential SQL or internal Java stack trace leakage from user-facing message', () => {
    const leakedDetail =
      'org.hibernate.exception.ConstraintViolationException: could not execute statement; SQLSTATE 23503';

    const pd: ProblemDetail = {
      type: 'https://civicresolve.ai/errors/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: leakedDetail,
    };

    const mockResponse = new Response(JSON.stringify(pd), {
      status: 500,
      statusText: 'Internal Server Error',
    });

    const error = ApiError.parse(mockResponse, pd);

    expect(error.userMessage).not.toContain('SQLSTATE');
    expect(error.userMessage).not.toContain('org.hibernate');
    expect(error.userMessage).toBe(
      'An unexpected server error occurred. Please try again later.'
    );
  });
});

