/**
 * SubmitGrievancePage.test.tsx
 *
 * Tests for the complaint submission page.
 * All API calls are mocked via vi.mock of the endpoints module.
 *
 * Backend contract enforced:
 *  - POST /api/grievances receives ONLY { description } — never the category.
 *  - No auto-retry on network errors.
 *  - Form data preserved on 400 validation errors.
 *  - MIN_LENGTH is 20 characters.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SubmitGrievancePage } from '../../src/features/grievances/SubmitGrievancePage';
import { ApiError } from '../../src/lib/errors/api-error';
import type { GrievanceSubmissionResponse } from '../../src/types/grievance';

// ── Mock the endpoints module ─────────────────────────────────────────────────
vi.mock('../../src/lib/api/endpoints', () => ({
  submitGrievance: vi.fn(),
}));

import { submitGrievance } from '../../src/lib/api/endpoints';

// ── Helpers ───────────────────────────────────────────────────────────────────
const MOCK_RESPONSE: GrievanceSubmissionResponse = {
  id: 'aabbccdd-0000-1111-2222-333344445555',
  trackingSecret: 'trk_mock_secret_value_1234567890_abcdefghijk1',
  category: 'Mortgage',
  assignedCategory: 'Mortgage',
  priority: 'MEDIUM',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-10-30T12:00:00Z',
  updatedAt: '2026-10-30T12:00:00Z',
  version: 0,
};

const VALID_DESCRIPTION =
  'I was charged a duplicate payment for my mortgage account and have not received a refund after 30 days.';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/submit']}>
      <SubmitGrievancePage />
    </MemoryRouter>
  );
}

describe('SubmitGrievancePage', () => {
  beforeEach(() => {
    vi.mocked(submitGrievance).mockResolvedValue(MOCK_RESPONSE);
  });

  // ── Form renders immediately ───────────────────────────────────────────────
  it('renders the complaint form immediately without a loading state', () => {
    renderPage();
    expect(screen.getByRole('textbox', { name: /complaint description/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit complaint/i })).toBeInTheDocument();
  });

  // ── Auto-classification notice ─────────────────────────────────────────────
  it('shows the auto-classification informational paragraph', () => {
    renderPage();
    expect(
      screen.getByText(/automatically assign a preliminary product category/i)
    ).toBeInTheDocument();
  });

  // ── Validation: description required ──────────────────────────────────────
  it('shows a validation error when the description is empty on submit', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() =>
      expect(screen.getAllByText(/description is required/i).length).toBeGreaterThanOrEqual(1)
    );
  });

  // ── Validation: description min length (19 chars — should fail) ────────────
  it('19-character description is rejected without API call', async () => {
    renderPage();

    // Type exactly 19 characters
    const nineteenChars = 'A'.repeat(19);
    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      nineteenChars
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() =>
      expect(screen.getAllByText(/at least 20 characters/i).length).toBeGreaterThanOrEqual(1)
    );
    expect(vi.mocked(submitGrievance)).not.toHaveBeenCalled();
  });

  // ── Validation: description min length (20 chars — should pass) ────────────
  it('20-character description passes client validation', async () => {
    renderPage();

    const twentyChars = 'A'.repeat(20);
    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      twentyChars
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() =>
      expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1)
    );
  });

  // ── Validation: description max length ────────────────────────────────────
  it('shows a validation error when description exceeds 5000 characters', async () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    const longText = 'A'.repeat(5001);
    await userEvent.clear(textarea);
    await userEvent.click(textarea);
    // Directly change the element's value using the DOM property setter wrapped in act
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    await act(async () => {
      nativeInputValueSetter?.call(textarea, longText);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() =>
      expect(screen.getAllByText(/must not exceed 5000 characters/i).length).toBeGreaterThanOrEqual(1)
    );
    expect(vi.mocked(submitGrievance)).not.toHaveBeenCalled();
  });

  it('accepts exactly 5000 characters without validation error and dispatches API call', async () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    const exactMaxText = 'A'.repeat(5000);
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    await act(async () => {
      nativeInputValueSetter?.call(textarea, exactMaxText);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() => {
      expect(vi.mocked(submitGrievance)).toHaveBeenCalledWith(
        { description: exactMaxText },
        expect.anything()
      );
    });
  });

  // ── Print styles ──────────────────────────────────────────────────────────
  it('applies print:hidden utility to header and footer', () => {
    const { container } = renderPage();
    const header = container.querySelector('header');
    const footer = container.querySelector('footer');

    expect(header).toHaveClass('print:hidden');
    expect(footer).toHaveClass('print:hidden');
  });

  // ── Character counter ──────────────────────────────────────────────────────
  it('shows a character counter that updates as the user types', async () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    await userEvent.type(textarea, 'Hello');
    expect(screen.getByText(/5 \/ 5000/)).toBeInTheDocument();
  });

  // ── Duplicate click guard ──────────────────────────────────────────────────
  it('Two rapid clicks produce only one API invocation', async () => {
    // Make submitGrievance block indefinitely
    vi.mocked(submitGrievance).mockImplementation(() => new Promise(() => {}));

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    const submitBtn = screen.getByRole('button', { name: /submit complaint/i });

    // Fire two clicks in rapid succession without awaiting between them
    await act(async () => {
      submitBtn.click();
      submitBtn.click();
    });

    // Wait a tick for the async machinery to settle
    await waitFor(() =>
      expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1)
    );
  });

  // ── Prevents double-submit (button disabled while in progress) ─────────────
  it('disables the submit button while a submission is in progress', async () => {
    vi.mocked(submitGrievance).mockImplementation(() => new Promise(() => {}));

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    const submitBtn = screen.getByRole('button', { name: /submit complaint/i });
    await userEvent.click(submitBtn);

    await waitFor(() =>
      expect(submitBtn).toBeDisabled()
    );
  });

  // ── POST body: only description ────────────────────────────────────────────
  it('calls submitGrievance with only { description } — not the category', async () => {
    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(vi.mocked(submitGrievance)).toHaveBeenCalledWith(
        { description: VALID_DESCRIPTION },
        expect.anything() // AbortSignal
      )
    );

    // Confirm category was NOT included in the POST body
    const callArgs = vi.mocked(submitGrievance).mock.calls;
    expect(callArgs.length).toBeGreaterThan(0);
    const callArg = callArgs[0]?.[0];
    expect(callArg).not.toHaveProperty('category');
    expect(callArg).not.toHaveProperty('selectedCategory');
  });

  // ── Success: shows receipt ─────────────────────────────────────────────────
  it('shows the submission receipt on a successful response', async () => {
    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/your complaint has been received/i)
      ).toBeInTheDocument()
    );
    expect(screen.getByText(MOCK_RESPONSE.id)).toBeInTheDocument();
  });

  // ── 400 validation errors ─────────────────────────────────────────────────
  it('shows server-returned validation errors on a 400 response and keeps form data', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(400, 'Bad Request', {
        type: 'about:blank',
        title: 'Validation Failed',
        status: 400,
        detail: 'Validation failed',
        errors: ['description: must not be blank', 'description: size must be between 20 and 5000'],
      })
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/description: must not be blank/i).length).toBeGreaterThanOrEqual(1)
    );

    // Form must still show (not receipt)
    expect(screen.queryByText(/your complaint has been received/i)).not.toBeInTheDocument();

    // Description value preserved
    expect(
      screen.getByRole('textbox', { name: /complaint description/i })
    ).toHaveValue(VALID_DESCRIPTION);

    // Guard released: user can resubmit after 400 validation fix
    vi.mocked(submitGrievance).mockResolvedValueOnce(MOCK_RESPONSE);
    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() =>
      expect(screen.getByText(/your complaint has been received/i)).toBeInTheDocument()
    );
  });

  // ── Uncertain state on network error ──────────────────────────────────────
  it('shows the uncertain state on a network-level error and does not retry', async () => {
    const netError = new Error('Network error');
    netError.name = 'NetworkError';
    vi.mocked(submitGrievance).mockRejectedValue(netError);

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );
    // No resubmit button should appear (only Return to home)
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── Uncertain state on HTTP 500 ───────────────────────────────────────────
  it('shows the uncertain state on an HTTP 500 response and locks the submission guard', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(500, 'Internal Server Error', {
        type: 'https://civicresolve.ai/errors/internal',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
      })
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── Uncertain state on HTTP 502 ───────────────────────────────────────────
  it('shows the uncertain state on an HTTP 502 Bad Gateway response', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(502, 'Bad Gateway', {
        type: 'https://civicresolve.ai/errors/nlp-service',
        title: 'Bad Gateway',
        status: 502,
        detail: 'Upstream gateway error.',
      })
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── Uncertain state on HTTP 503 ───────────────────────────────────────────
  it('shows the uncertain state on an HTTP 503 Service Unavailable response', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(503, 'Service Unavailable', {
        type: 'https://civicresolve.ai/errors/nlp-service',
        title: 'Service Unavailable',
        status: 503,
        detail: 'The automated classification service is temporarily unavailable.',
      })
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── Uncertain state on HTTP 504 ───────────────────────────────────────────
  it('shows the uncertain state on an HTTP 504 Gateway Timeout response', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(504, 'Gateway Timeout', {
        type: 'https://civicresolve.ai/errors/nlp-service',
        title: 'Gateway Timeout',
        status: 504,
        detail: 'The request timed out.',
      })
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── No auto-retry ─────────────────────────────────────────────────────────
  it('does NOT call submitGrievance more than once — no automatic retry', async () => {
    const netError = new Error('Network failure');
    vi.mocked(submitGrievance).mockRejectedValue(netError);

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument()
    );

    // Exactly one call was made; no retry occurred
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });

  // ── Guard remains locked on uncertain outcome ──────────────────────────────
  it('prevents any subsequent API submission while the outcome remains uncertain', async () => {
    vi.mocked(submitGrievance).mockRejectedValue(
      new ApiError(500, 'Internal Server Error')
    );

    renderPage();

    await userEvent.type(
      screen.getByRole('textbox', { name: /complaint description/i }),
      VALID_DESCRIPTION
    );

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /submission could not be confirmed/i })
      ).toBeInTheDocument()
    );

    // Submit button is unmounted from DOM
    expect(screen.queryByRole('button', { name: /submit complaint/i })).not.toBeInTheDocument();
    // Only one submission call was dispatched
    expect(vi.mocked(submitGrievance)).toHaveBeenCalledTimes(1);
  });
});
