/**
 * SubmitGrievancePage.a11y.test.tsx
 *
 * Accessibility-focused tests for the complaint submission form.
 * Verifies label/input association, ARIA attributes, and keyboard accessibility.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SubmitGrievancePage } from '../../src/features/grievances/SubmitGrievancePage';
import userEvent from '@testing-library/user-event';
import type { GrievanceSubmissionResponse } from '../../src/types/grievance';

vi.mock('../../src/lib/api/endpoints', () => ({
  submitGrievance: vi.fn(),
}));

import { submitGrievance } from '../../src/lib/api/endpoints';

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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/submit']}>
      <SubmitGrievancePage />
    </MemoryRouter>
  );
}

describe('SubmitGrievancePage — Accessibility', () => {
  beforeEach(() => {
    vi.mocked(submitGrievance).mockResolvedValue(MOCK_RESPONSE);
  });

  it('has a <main> landmark', () => {
    renderPage();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('the description <textarea> has an associated <label> via htmlFor', () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    const textareaId = textarea.getAttribute('id');
    expect(textareaId).toBeTruthy();

    const label = document.querySelector(`label[for="${textareaId}"]`);
    expect(label).toBeInTheDocument();
    expect(label?.textContent?.toLowerCase()).toContain('complaint description');
  });

  it('the description textarea is marked aria-required="true"', () => {
    renderPage();

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    expect(textarea).toHaveAttribute('aria-required', 'true');
  });

  it('sets aria-invalid on the description textarea after a validation error', async () => {
    renderPage();

    // Leave description empty and click submit
    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    const textarea = screen.getByRole('textbox', { name: /complaint description/i });
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('error messages have role="alert" for immediate screen reader announcement', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /submit complaint/i }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  });

  it('the description textarea counter has aria-live="polite"', () => {
    renderPage();

    const counter = document.querySelector('[aria-live="polite"]');
    expect(counter).toBeInTheDocument();
  });

  it('submit button is keyboard accessible (not pointer-events-none when enabled)', () => {
    renderPage();

    const button = screen.getByRole('button', { name: /submit complaint/i });
    expect(button).toBeEnabled();
    expect(button.className).not.toMatch(/(^|\s)pointer-events-none(\s|$)/);
  });
});
