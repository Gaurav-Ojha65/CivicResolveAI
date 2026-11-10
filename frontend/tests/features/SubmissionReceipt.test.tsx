/**
 * SubmissionReceipt.test.tsx
 *
 * Tests for the receipt component shown after a successful grievance submission.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SubmissionReceipt } from '../../src/features/grievances/SubmissionReceipt';
import { GrievanceResponse, GrievanceSubmissionResponse } from '../../src/types/grievance';

const MOCK_RESULT: GrievanceResponse = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  assignedCategory: 'Credit card or prepaid card',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:01Z',
};

function renderReceipt(result: GrievanceSubmissionResponse | GrievanceResponse = MOCK_RESULT) {
  return render(
    <MemoryRouter initialEntries={['/submit']}>
      <SubmissionReceipt result={result} />
    </MemoryRouter>
  );
}

describe('SubmissionReceipt', () => {
  it('renders the success headline', () => {
    renderReceipt();
    expect(
      screen.getByText(/your complaint has been received/i)
    ).toBeInTheDocument();
  });

  it('renders the grievance ID', () => {
    renderReceipt();
    expect(screen.getByText(MOCK_RESULT.id)).toBeInTheDocument();
  });

  it('renders the assigned category', () => {
    renderReceipt();
    expect(screen.getByText('Credit card or prepaid card')).toBeInTheDocument();
  });

  it('renders a formatted submission timestamp', () => {
    renderReceipt();
    // The time element should be present with the ISO dateTime attribute
    const timeEl = document.querySelector('time');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl?.getAttribute('dateTime')).toBe(MOCK_RESULT.submittedAt);
  });

  it('renders a StatusIndicator for the priority', () => {
    renderReceipt();
    // StatusIndicator renders the priority label
    expect(screen.getByText(/high priority/i)).toBeInTheDocument();
  });

  it('renders a StatusIndicator for the review status', () => {
    renderReceipt();
    expect(screen.getByText(/pending review/i)).toBeInTheDocument();
  });

  it('renders the disclosure text', () => {
    renderReceipt();
    expect(screen.getByText(/preliminary and does not represent/i)).toBeInTheDocument();
  });

  it('renders a "Return to home" link pointing to /', () => {
    renderReceipt();
    const homeLink = screen.getByRole('link', { name: /return to home/i });
    expect(homeLink).toHaveAttribute('href', '/');
  });

  it('renders a Print / Save button', () => {
    renderReceipt();
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('renders a Download Official Receipt (.txt) button and triggers download', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    renderReceipt();
    const downloadBtn = screen.getByRole('button', { name: /download official receipt/i });
    expect(downloadBtn).toBeInTheDocument();

    await userEvent.click(downloadBtn);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/downloaded!/i)).toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it('calls window.print when Print / Save is clicked', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderReceipt();
    await userEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('renders a copy reference button', () => {
    renderReceipt();
    expect(
      screen.getByRole('button', { name: /copy reference/i })
    ).toBeInTheDocument();
  });

  it('calls navigator.clipboard.writeText with the grievance ID when copy is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    renderReceipt();
    await userEvent.click(screen.getByRole('button', { name: /copy reference/i }));
    expect(writeTextMock).toHaveBeenCalledWith(MOCK_RESULT.id);
  });

  it('shows "Copied!" feedback after copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    renderReceipt();
    await userEvent.click(screen.getByRole('button', { name: /copy reference/i }));
    expect(screen.getByText(/copied!/i)).toBeInTheDocument();
  });

  it('shows accessible error alert when navigator.clipboard.writeText rejects', async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error('Clipboard permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    renderReceipt();
    await userEvent.click(screen.getByRole('button', { name: /copy reference/i }));

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(/copy failed\. please select and copy the reference manually\./i);
  });

  it('hides action buttons in print view using print:hidden class', () => {
    const { container } = renderReceipt();
    const actionContainer = container.querySelector('.print\\:hidden');
    expect(actionContainer).toBeInTheDocument();
  });

  it('renders correctly for CRITICAL priority and REJECTED status', () => {
    renderReceipt({
      ...MOCK_RESULT,
      priority: 'CRITICAL',
      status: 'REJECTED',
    });
    expect(screen.getByText(/critical priority/i)).toBeInTheDocument();
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
  });

  it('renders correctly for LOW priority and AUTO_ROUTED status', () => {
    renderReceipt({
      ...MOCK_RESULT,
      priority: 'LOW',
      status: 'AUTO_ROUTED',
    });
    expect(screen.getByText(/low priority/i)).toBeInTheDocument();
    expect(screen.getByText(/auto-routed/i)).toBeInTheDocument();
  });

  it('has role="status" with aria-live="polite" for screen reader announcement', () => {
    const { container } = renderReceipt();
    const statusEl = container.querySelector('[role="status"]');
    expect(statusEl).toBeInTheDocument();
    expect(statusEl).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a dl with labelled dt/dd pairs', () => {
    renderReceipt();
    expect(document.querySelector('dl')).toBeInTheDocument();
    const dts = document.querySelectorAll('dt');
    expect(dts.length).toBeGreaterThanOrEqual(4);
  });

  it('prominently displays one-time tracking secret and immediate warning when present', () => {
    const submission: GrievanceSubmissionResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      trackingSecret: 'trk_TestOneTimeSecretValue1234567890abcdefghij',
      category: 'Debt collection',
      priority: 'HIGH',
      status: 'PENDING_REVIEW',
      reviewRequired: true,
      submittedAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:01Z',
      version: 0,
    };
    renderReceipt(submission);

    expect(screen.getByText(/save your tracking secret immediately/i)).toBeInTheDocument();
    expect(screen.getByText('trk_TestOneTimeSecretValue1234567890abcdefghij')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy tracking secret/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track complaint progress/i })).toHaveAttribute('href', '/track');
  });

  it('copies tracking secret when copy tracking secret button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const submission: GrievanceSubmissionResponse = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      trackingSecret: 'trk_TestOneTimeSecretValue1234567890abcdefghij',
      category: 'Debt collection',
      priority: 'HIGH',
      status: 'PENDING_REVIEW',
      reviewRequired: true,
      submittedAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:01Z',
      version: 0,
    };
    renderReceipt(submission);

    await userEvent.click(screen.getByRole('button', { name: /copy tracking secret/i }));
    expect(writeTextMock).toHaveBeenCalledWith('trk_TestOneTimeSecretValue1234567890abcdefghij');
  });
});
