/**
 * TrackGrievancePage.test.tsx
 *
 * Unit and integration tests for the public complaint tracking page.
 * Enforces:
 *  - Strict client format validation (UUID & trk_ + 43 characters).
 *  - Show/hide secret toggle.
 *  - Uniform error display on 404 and 429.
 *  - Full chronological timeline rendering for backend stages.
 *  - Reset capability and memory protection.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TrackGrievancePage } from '../../src/features/tracking/TrackGrievancePage';
import { ApiError } from '../../src/lib/errors/api-error';
import type { GrievanceTrackingResponse } from '../../src/types/grievance';

// ── Mock endpoints ─────────────────────────────────────────────────────────────
vi.mock('../../src/lib/api/endpoints', () => ({
  trackGrievance: vi.fn(),
}));

import { trackGrievance } from '../../src/lib/api/endpoints';

const VALID_UUID = '7b1d9c24-5e3a-4a2e-8a12-872f9d8a5431';
// trk_ (4) + 43 characters = 47 characters total
const VALID_SECRET = 'trk_mock_secret_value_1234567890_abcdefghijk123';

const MOCK_TRACKING_RESPONSE: GrievanceTrackingResponse = {
  referenceId: '7b1d9c24-5e3a-4a2e-8a12-872f9d8a5431',
  assignedCategory: 'Credit Card',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  submittedAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:05:00Z',
  timeline: [
    {
      stage: 'SUBMITTED',
      status: 'PENDING_REVIEW',
      title: 'Submission Received',
      description: 'Grievance submitted by consumer',
      timestamp: '2026-10-30T10:00:00Z',
    },
    {
      stage: 'AUTOMATED_TRIAGE',
      status: 'PENDING_REVIEW',
      title: 'Triage Processing',
      description: 'Automated ML classification and triage completed',
      timestamp: '2026-10-30T10:01:00Z',
    },
    {
      stage: 'STATUS_UPDATE',
      status: 'PENDING_REVIEW',
      title: 'Specialist Assigned',
      description: 'Queued for human specialist review',
      timestamp: '2026-10-30T10:05:00Z',
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/track']}>
      <TrackGrievancePage />
    </MemoryRouter>
  );
}

describe('TrackGrievancePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial tracking form with required input fields and hints', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /track complaint status/i })).toBeInTheDocument();
    expect(screen.getByText(/secure case lookup/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reference id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time tracking secret/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /track complaint/i })).toBeInTheDocument();
  });

  it('rejects empty input fields without invoking API', async () => {
    const user = userEvent.setup();
    renderPage();

    const submitBtn = screen.getByRole('button', { name: /track complaint/i });
    await user.click(submitBtn);

    expect(trackGrievance).not.toHaveBeenCalled();
    expect(screen.getByText(/reference id is required/i)).toBeInTheDocument();
    expect(screen.getByText(/tracking secret is required/i)).toBeInTheDocument();
  });

  it('validates UUID format and secret format before calling API', async () => {
    const user = userEvent.setup();
    renderPage();

    const idInput = screen.getByLabelText(/reference id/i);
    const secretInput = screen.getByLabelText(/one-time tracking secret/i);
    const submitBtn = screen.getByRole('button', { name: /track complaint/i });

    // Invalid format
    fireEvent.change(idInput, { target: { value: 'invalid-uuid-format' } });
    fireEvent.change(secretInput, { target: { value: 'not_a_valid_secret' } });
    await user.click(submitBtn);

    expect(trackGrievance).not.toHaveBeenCalled();
    expect(screen.getByText(/reference id must be a valid uuid/i)).toBeInTheDocument();
    expect(screen.getByText(/tracking secret must start with trk_/i)).toBeInTheDocument();
  });

  it('toggles tracking secret mask visibility', async () => {
    const user = userEvent.setup();
    renderPage();

    const secretInput = screen.getByLabelText(/one-time tracking secret/i);
    expect(secretInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: /show tracking secret/i });
    await user.click(toggleBtn);

    expect(secretInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide tracking secret/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide tracking secret/i }));
    expect(secretInput).toHaveAttribute('type', 'password');
  });

  it('submits valid credentials and renders complaint details and timeline', async () => {
    const user = userEvent.setup();
    vi.mocked(trackGrievance).mockResolvedValueOnce(MOCK_TRACKING_RESPONSE);

    renderPage();

    fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
    fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });

    await user.click(screen.getByRole('button', { name: /track complaint/i }));

    expect(trackGrievance).toHaveBeenCalledWith(
      {
        referenceId: VALID_UUID,
        trackingSecret: VALID_SECRET,
      },
      expect.any(AbortSignal)
    );

    await waitFor(() => {
      expect(screen.getByText(VALID_UUID)).toBeInTheDocument();
      expect(screen.getByText('Credit Card')).toBeInTheDocument();
      expect(screen.getByText(/intake received/i)).toBeInTheDocument();
      expect(screen.getByText(/automated routing/i)).toBeInTheDocument();
      expect(screen.getByText(/queued for human specialist review/i)).toBeInTheDocument();
    });
  });

  it('displays 404 uniform error without leaking internal state', async () => {
    const user = userEvent.setup();
    vi.mocked(trackGrievance).mockRejectedValueOnce(
      new ApiError(404, 'Not Found')
    );

    renderPage();

    fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
    fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });

    await user.click(screen.getByRole('button', { name: /track complaint/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/complaint not found or invalid tracking secret/i)
      ).toBeInTheDocument();
    });
  });

  it('displays 429 rate limit error when velocity threshold exceeded', async () => {
    const user = userEvent.setup();
    vi.mocked(trackGrievance).mockRejectedValueOnce(
      new ApiError(429, 'Too Many Requests')
    );

    renderPage();

    fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
    fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });

    await user.click(screen.getByRole('button', { name: /track complaint/i }));

    await waitFor(() => {
      expect(screen.getByText(/too many tracking attempts/i)).toBeInTheDocument();
    });
  });

  it('allows resetting after a successful query to track another complaint', async () => {
    const user = userEvent.setup();
    vi.mocked(trackGrievance).mockResolvedValueOnce(MOCK_TRACKING_RESPONSE);

    renderPage();

    fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
    fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });

    await user.click(screen.getByRole('button', { name: /track complaint/i }));

    await waitFor(() => {
      expect(screen.getByText(VALID_UUID)).toBeInTheDocument();
    });

    const resetBtn = screen.getByRole('button', { name: /track another complaint/i });
    await user.click(resetBtn);

    expect(screen.getByLabelText(/reference id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/reference id/i)).toHaveValue('');
    expect(screen.getByLabelText(/one-time tracking secret/i)).toHaveValue('');
  });

  it('renders progress stepper and allows copying reference ID to clipboard', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      writable: true,
      configurable: true,
    });

    vi.mocked(trackGrievance).mockResolvedValueOnce(MOCK_TRACKING_RESPONSE);

    renderPage();

    fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
    fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });

    await user.click(screen.getByRole('button', { name: /track complaint/i }));

    await waitFor(() => {
      expect(screen.getByText(VALID_UUID)).toBeInTheDocument();
    });

    // Check progress stepper items
    expect(screen.getByText('Received')).toBeInTheDocument();
    expect(screen.getByText('Auto-Triaged')).toBeInTheDocument();
    expect(screen.getByText('Specialist review (if needed)')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();

    // Copy reference ID
    const copyBtn = screen.getByRole('button', { name: /copy reference id/i });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith(VALID_UUID);
    expect(screen.getByRole('button', { name: /reference id copied/i })).toBeInTheDocument();
  });

  describe('Status Stepper Exhaustive Suite (one test per status)', () => {
    it('correctly maps PENDING_REVIEW to Stage 2 of 4: Auto-Triaged', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'PENDING_REVIEW',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 2 of 4: Auto-Triaged')).toBeInTheDocument();
      });
    });

    it('correctly maps AUTO_ROUTED to Stage 2 of 4: Auto-Triaged (not Resolved)', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'AUTO_ROUTED',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 2 of 4: Auto-Triaged')).toBeInTheDocument();
      });
      expect(screen.queryByText('Stage 4 of 4: Resolved')).not.toBeInTheDocument();
    });

    it('correctly maps UNDER_REVIEW to Stage 3 of 4: Specialist review (if needed)', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'UNDER_REVIEW',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 3 of 4: Specialist review (if needed)')).toBeInTheDocument();
      });
    });

    it('correctly maps APPROVED to Stage 4 of 4: Resolved', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'APPROVED',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 4 of 4: Resolved')).toBeInTheDocument();
      });
    });

    it('correctly maps OVERRIDDEN to Stage 4 of 4: Resolved', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'OVERRIDDEN',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 4 of 4: Resolved')).toBeInTheDocument();
      });
    });

    it('correctly maps REJECTED to Stage 4 of 4: Closed', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'REJECTED',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 4 of 4: Closed')).toBeInTheDocument();
      });
    });

    it('correctly maps DISMISSED to Stage 4 of 4: Closed without a success check', async () => {
      const user = userEvent.setup();
      vi.mocked(trackGrievance).mockResolvedValueOnce({
        ...MOCK_TRACKING_RESPONSE,
        status: 'DISMISSED',
      });

      renderPage();
      fireEvent.change(screen.getByLabelText(/reference id/i), { target: { value: VALID_UUID } });
      fireEvent.change(screen.getByLabelText(/one-time tracking secret/i), { target: { value: VALID_SECRET } });
      await user.click(screen.getByRole('button', { name: /track complaint/i }));

      await waitFor(() => {
        expect(screen.getByText('Stage 4 of 4: Closed')).toBeInTheDocument();
      });
      // Verify DISMISSED renders as Closed in status indicator and stepper
      const closedElements = screen.getAllByText('Closed');
      expect(closedElements.length).toBeGreaterThan(0);
      // Verify no success check icon is rendered for step 4
      const step4 = screen.getByRole('list', { name: /complaint progress stepper/i }).querySelectorAll('li')[3];
      expect(step4?.querySelector('svg.lucide-check')).toBeNull();
    });
  });
});
