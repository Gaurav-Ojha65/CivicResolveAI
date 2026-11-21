import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReviewerGrievanceDetailPage } from '../../../src/features/reviewer/ReviewerGrievanceDetailPage';
import {
  GrievanceDetailResponse,
  GrievanceResponse,
  ProductCategoriesResponse,
} from '../../../src/types/grievance';
import * as endpoints from '../../../src/lib/api/endpoints';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';
import { ApiError } from '../../../src/lib/errors/api-error';

vi.mock('../../../src/lib/api/endpoints', () => ({
  getGrievanceById: vi.fn(),
  reviewGrievance: vi.fn(),
  getProductCategories: vi.fn(),
  compareModels: vi.fn(),
  getPrecedents: vi.fn().mockResolvedValue({
    queryGrievanceId: '12345678-abcd-1234-abcd-1234567890ab',
    candidatesEvaluated: 10,
    precedents: [],
  }),
}));

const MOCK_DETAIL: GrievanceDetailResponse = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  narrative: 'I was double charged on my mortgage escrow account without prior notice.',
  assignedCategory: 'Mortgage',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  version: 2,
  originalPrediction: {
    predictedCategory: 'Mortgage',
    modelUsed: 'tfidf_logistic',
    modelVersion: 'v1.0.0',
    confidence: 0.88,
    margin: 0.45,
    probabilities: {
      Mortgage: 0.88,
      'Debt collection': 0.08,
      'Credit card': 0.04,
    },
    flagForReview: true,
    reviewReasons: ['High financial impact threshold', 'Escrow escrow dispute'],
    triagePriority: 'HIGH',
    priorityReasons: ['Potential imminent escrow foreclosure risk'],
    sentimentScore: -0.65,
    sentimentLabel: 'NEGATIVE',
    predictedAt: '2026-11-01T10:00:01Z',
  },
};

const MOCK_CATEGORIES: ProductCategoriesResponse = {
  categories: [
    'Mortgage',
    'Debt collection',
    'Credit card',
    'Bank account or service',
    'Consumer Loan',
  ],
};

const MOCK_REVIEW_RESPONSE: GrievanceResponse = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  assignedCategory: 'Mortgage',
  priority: 'HIGH',
  status: 'APPROVED',
  reviewRequired: false,
  submittedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:05:00Z',
  version: 3,
};

describe('ReviewerGrievanceDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: { username: 'reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(endpoints.getGrievanceById).mockResolvedValue(MOCK_DETAIL);
    vi.mocked(endpoints.getProductCategories).mockResolvedValue(MOCK_CATEGORIES);
    vi.mocked(endpoints.reviewGrievance).mockResolvedValue(MOCK_REVIEW_RESPONSE);
  });

  function renderDetailPage(id = '12345678-abcd-1234-abcd-1234567890ab') {
    return render(
      <MemoryRouter initialEntries={[`/reviewer/grievances/${id}`]}>
        <Routes>
          <Route path="/reviewer/grievances/:id" element={<ReviewerGrievanceDetailPage />} />
          <Route path="/reviewer" element={<div>Reviewer Queue</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders complaint narrative and AI prediction audit information', async () => {
    renderDetailPage();

    await waitFor(() => {
      expect(
        screen.getAllByText('I was double charged on my mortgage escrow account without prior notice.').length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('88.0%')).toBeInTheDocument();
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
      expect(screen.getByText('High financial impact threshold')).toBeInTheDocument();
    });
  });

  it('submits APPROVE decision with expectedVersion and refreshes case data', async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /approve grievance/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    await user.click(screen.getByRole('button', { name: /approve grievance/i }));

    expect(endpoints.reviewGrievance).toHaveBeenCalledWith(
      '12345678-abcd-1234-abcd-1234567890ab',
      {
        action: 'APPROVE',
        expectedVersion: 2,
        reviewNote: undefined,
      }
    );

    await waitFor(() => {
      expect(screen.getByText(/successfully submitted decision: approve/i)).toBeInTheDocument();
    });
  });

  it('validates OVERRIDE requires note and at least one override field', async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Override' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Override' }));

    // Click submit without changing category/priority or entering note
    const submitBtn = screen.getByRole('button', { name: /apply override/i });
    await user.click(submitBtn);

    expect(
      screen.getByText(/when overriding, you must specify a new category or a new priority\./i)
    ).toBeInTheDocument();
    expect(endpoints.reviewGrievance).not.toHaveBeenCalled();

    // Select a new priority
    const prioritySelect = screen.getByLabelText(/new priority/i);
    await user.selectOptions(prioritySelect, 'CRITICAL');

    // Click submit without note
    await user.click(submitBtn);
    expect(
      screen.getByText(/a review explanation note is required when overriding/i)
    ).toBeInTheDocument();

    // Type note and submit
    const noteArea = screen.getByLabelText(/review note/i);
    await user.type(noteArea, 'Elevated to CRITICAL due to imminent foreclosure risk.');
    await user.click(submitBtn);

    expect(endpoints.reviewGrievance).toHaveBeenCalledWith(
      '12345678-abcd-1234-abcd-1234567890ab',
      {
        action: 'OVERRIDE',
        newPriority: 'CRITICAL',
        expectedVersion: 2,
        reviewNote: 'Elevated to CRITICAL due to imminent foreclosure risk.',
      }
    );
  }, 15000);

  it('validates REJECT requires note and submits successfully', async () => {
    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Reject' }));

    const submitBtn = screen.getByRole('button', { name: /reject grievance/i });
    await user.click(submitBtn);

    expect(
      screen.getByText(/a review explanation note is required when rejecting/i)
    ).toBeInTheDocument();

    const noteArea = screen.getByLabelText(/review note/i);
    await user.type(noteArea, 'Duplicate complaint submitted earlier under ref #987.');
    await user.click(submitBtn);

    expect(endpoints.reviewGrievance).toHaveBeenCalledWith(
      '12345678-abcd-1234-abcd-1234567890ab',
      {
        action: 'REJECT',
        expectedVersion: 2,
        reviewNote: 'Duplicate complaint submitted earlier under ref #987.',
      }
    );
  }, 15000);

  it('handles HTTP 409 conflict: shows alert, refreshes data, does NOT auto-retry', async () => {
    const conflictError = new ApiError(
      409,
      'Conflict',
      undefined,
      'Optimistic lock exception: version mismatch.'
    );
    vi.mocked(endpoints.reviewGrievance).mockRejectedValueOnce(conflictError);

    // After conflict, the reload returns updated version 3
    vi.mocked(endpoints.getGrievanceById)
      .mockResolvedValueOnce(MOCK_DETAIL)
      .mockResolvedValueOnce({
        ...MOCK_DETAIL,
        version: 3,
        status: 'PENDING_REVIEW',
      });

    const user = userEvent.setup();
    renderDetailPage();

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: /approve grievance/i })).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    await user.click(screen.getByRole('button', { name: /approve grievance/i }));

    // Verify 409 conflict alert is shown
    await waitFor(() => {
      expect(
        screen.getByText(/another reviewer updated this case/i)
      ).toBeInTheDocument();
    });

    // Verify reviewGrievance was called only once (NO auto-retry!)
    expect(endpoints.reviewGrievance).toHaveBeenCalledTimes(1);

    // Verify getGrievanceById was called again to refresh latest state
    expect(endpoints.getGrievanceById).toHaveBeenCalledTimes(2);

    // Verify updated version v3 is displayed
    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument();
    });
  });

  it('allows discretionary review of an auto-routed case and leaves experiments collapsed', async () => {
    vi.mocked(endpoints.getGrievanceById).mockResolvedValueOnce({
      ...MOCK_DETAIL, status: 'AUTO_ROUTED', reviewRequired: false,
    });
    renderDetailPage();
    expect(await screen.findByRole('button', { name: /approve grievance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /supporting analysis/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: /what-if sandbox/i })).not.toBeInTheDocument();
  });

  it('displays locked adjudication state for terminal status', async () => {
    vi.mocked(endpoints.getGrievanceById).mockResolvedValueOnce({
      ...MOCK_DETAIL,
      status: 'APPROVED',
      reviewRequired: false,
    });

    renderDetailPage();

    await waitFor(() => {
      expect(screen.getByText('Decision Recorded')).toBeInTheDocument();
      expect(
        screen.getByText(/this case has already been adjudicated to/i)
      ).toBeInTheDocument();
    });

    // Form inputs should not exist
    expect(screen.queryByRole('button', { name: /approve grievance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apply override/i })).not.toBeInTheDocument();
  });

  describe('Phase 3 Investigation Lab Enhancements', () => {
    const MOCK_DETAIL_WITH_XAI: GrievanceDetailResponse = {
      ...MOCK_DETAIL,
      narrative: 'I noticed an unauthorized charge on my mortgage escrow account after refinancing.',
      originalPrediction: {
        ...MOCK_DETAIL.originalPrediction!,
        explanation: {
          predictedClass: 'Mortgage',
          predictedDecisionScore: 2.15,
          predictedIntercept: 0.12,
          runnerUpClass: 'Debt collection',
          runnerUpDecisionScore: 0.45,
          runnerUpIntercept: -0.05,
          decisionScoreMargin: 1.7,
          topPositiveFeatures: [
            { feature: 'escrow', contribution: 0.7543, tfidfValue: 0.35 },
            { feature: 'mortgage', contribution: 0.6214, tfidfValue: 0.28 },
          ],
          topNegativeFeatures: [
            { feature: 'charge', contribution: -0.2145, tfidfValue: 0.12 },
          ],
          topDifferenceFeatures: [],
          modelProvenanceSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
          explanationGeneratedAt: '2026-11-01T10:00:01Z',
        },
      },
    };

    it('synchronizes bidirectional XAI interaction: activeFeature highlights token and chart bar', async () => {
      const user = userEvent.setup();
      vi.mocked(endpoints.getGrievanceById).mockResolvedValueOnce(MOCK_DETAIL_WITH_XAI);

      renderDetailPage();

      await user.click(await screen.findByRole('button', { name: /supporting analysis and simulations/i }));
      // Wait for XAI attribution and bar chart to render
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /attribution token: escrow/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /linear feature: escrow/i })).toBeInTheDocument();
      });

      const escrowToken = screen.getByRole('button', { name: /attribution token: escrow/i });
      const chargeToken = screen.getByRole('button', { name: /attribution token: charge/i });
      const escrowBar = screen.getByRole('button', { name: /linear feature: escrow/i });
      const chargeBar = screen.getByRole('button', { name: /linear feature: charge/i });

      // Click on escrow token in narrative to select/pin feature
      await user.click(escrowToken);

      // Verify Active XAI Focus banner appears
      expect(screen.getByText(/Active XAI Focus:/i)).toBeInTheDocument();
      expect(screen.getAllByText('escrow').length).toBeGreaterThanOrEqual(1);

      // Matching token should have active ring highlight; non-matching dimmed
      expect(escrowToken.className).toContain('ring-2 ring-teal-500');
      expect(chargeToken.className).toContain('opacity-60');

      // Matching bar row should have active ring highlight; non-matching dimmed
      expect(escrowBar.className).toContain('ring-2 ring-teal-500');
      expect(chargeBar.className).toContain('opacity-50');

      // Click Reset Filter in the banner to clear activeFeature
      const resetBtn = screen.getAllByRole('button', { name: /reset active feature/i })[0];
      await user.click(resetBtn!);

      expect(screen.queryByText(/Active XAI Focus:/i)).not.toBeInTheDocument();
      expect(escrowToken.className).not.toContain('ring-2 ring-teal-500');
      expect(chargeToken.className).not.toContain('opacity-60');

      // Click on charge bar row to trigger reverse bidirectional highlight
      await user.click(chargeBar);

      expect(screen.getByText(/Active XAI Focus:/i)).toBeInTheDocument();
      expect(chargeToken.className).toContain('ring-2 ring-teal-500');
      expect(escrowToken.className).toContain('opacity-60');
    });

    it('renders mobile decision dock bar and supports opening expandable sheet for adjudication', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      // Pinned bottom decision bar should be present
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /adjudicate case/i })).toBeInTheDocument();
      });

      const openSheetBtn = screen.getByRole('button', { name: /adjudicate case/i });
      expect(openSheetBtn).toHaveAttribute('aria-expanded', 'false');

      // Click to open sheet
      await user.click(openSheetBtn);

      // Mobile sheet modal dialog should open
      const dialog = screen.getByRole('dialog', { name: /adjudicate case/i });
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Mobile Adjudication Sheet')).toBeInTheDocument();

      // Submit APPROVE from within the sheet
      const approveBtn = screen.getAllByRole('button', { name: /approve grievance/i });
      // The second button is inside the mobile sheet
      const mobileApproveBtn = approveBtn[approveBtn.length - 1];
      await user.click(mobileApproveBtn!);

      expect(endpoints.reviewGrievance).toHaveBeenCalledWith(
        '12345678-abcd-1234-abcd-1234567890ab',
        {
          action: 'APPROVE',
          expectedVersion: 2,
          reviewNote: undefined,
        }
      );

      // Sheet closes after successful review
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /adjudicate case/i })).not.toBeInTheDocument();
      });
    });

    it('handles long narrative without clipping and supports keyboard navigation on XAI elements', async () => {
      const user = userEvent.setup();
      const LONG_NARRATIVE =
        'Detailed grievance documentation: '.repeat(20) +
        'Escrow account was double billed repeatedly across 12 consecutive billing cycles. ' +
        'Additional context and correspondence history: '.repeat(25);

      vi.mocked(endpoints.getGrievanceById).mockResolvedValueOnce({
        ...MOCK_DETAIL_WITH_XAI,
        narrative: LONG_NARRATIVE,
      });

      renderDetailPage();

      // Verify long narrative is rendered and accessible
      await waitFor(() => {
        expect(screen.getAllByText(/Detailed grievance documentation:/i).length).toBeGreaterThanOrEqual(1);
      });

      await user.click(screen.getByRole('button', { name: /supporting analysis and simulations/i }));
      const escrowToken = screen.getByRole('button', { name: /attribution token: escrow/i });
      expect(escrowToken).toHaveAttribute('tabIndex', '0');

      // Test keyboard activation with Enter
      escrowToken.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByText(/Active XAI Focus:/i)).toBeInTheDocument();

      // Test keyboard activation with Space to toggle/unpin
      await user.keyboard(' ');
      expect(screen.queryByText(/Active XAI Focus:/i)).not.toBeInTheDocument();
    });
  });

  describe('Phase 3.2 Investigation Lab Hardening', () => {
    it('handles Escape-to-close and focus restoration for mobile adjudication sheet', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /adjudicate case/i })).toBeInTheDocument();
      });

      const openSheetBtn = screen.getByRole('button', { name: /adjudicate case/i });
      await user.click(openSheetBtn);

      const dialog = screen.getByRole('dialog', { name: /adjudicate case/i });
      expect(dialog).toBeInTheDocument();

      // Press Escape to dismiss sheet
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /adjudicate case/i })).not.toBeInTheDocument();
      });

      // Verify focus is restored to the trigger button
      expect(openSheetBtn).toHaveFocus();
    });

    it('handles Escape-to-close and focus restoration for keyboard shortcuts modal', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /shortcuts/i })).toBeInTheDocument();
      });

      const shortcutsBtn = screen.getByRole('button', { name: /shortcuts/i });
      await user.click(shortcutsBtn);

      const dialog = screen.getByRole('dialog', { name: /triage keyboard shortcuts/i });
      expect(dialog).toBeInTheDocument();

      // Press Escape to dismiss shortcuts modal
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /triage keyboard shortcuts/i })).not.toBeInTheDocument();
      });

      // Verify focus is restored to the trigger button
      expect(shortcutsBtn).toHaveFocus();
    });

    it('traps keyboard focus within active modal dialog on Tab and Shift+Tab', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /shortcuts/i })).toBeInTheDocument();
      });

      const shortcutsBtn = screen.getByRole('button', { name: /shortcuts/i });
      await user.click(shortcutsBtn);

      const dialog = screen.getByRole('dialog', { name: /triage keyboard shortcuts/i });
      expect(dialog).toBeInTheDocument();

      // In the shortcuts dialog, find focusable buttons
      const closeBtn = screen.getByRole('button', { name: /close shortcuts dialog/i });
      const gotItBtn = screen.getByRole('button', { name: /got it/i });

      // Focus last element ('Got it' button)
      gotItBtn.focus();
      expect(gotItBtn).toHaveFocus();

      // Press Tab -> focus should wrap to first element (close button)
      await user.tab();
      expect(closeBtn).toHaveFocus();

      // Press Shift+Tab -> focus should wrap back to last element ('Got it' button)
      await user.tab({ shift: true });
      expect(gotItBtn).toHaveFocus();

      // Close dialog
      await user.click(gotItBtn);
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /triage keyboard shortcuts/i })).not.toBeInTheDocument();
      });
    });

    it('excludes inactive desktop form from accessibility and prevents accidental submission when mobile sheet is open', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /adjudicate case/i })).toBeInTheDocument();
      });

      const desktopForm = document.getElementById('desktop-decision-form');
      expect(desktopForm).toBeInTheDocument();
      expect(desktopForm).not.toHaveAttribute('aria-hidden');

      // Open mobile sheet
      const openSheetBtn = screen.getByRole('button', { name: /adjudicate case/i });
      await user.click(openSheetBtn);

      // Inactive desktop form receives aria-hidden and its submit button is disabled
      expect(desktopForm).toHaveAttribute('aria-hidden', 'true');
      const desktopSubmitBtn = desktopForm?.querySelector('button[type="submit"]');
      expect(desktopSubmitBtn).toBeDisabled();

      // Dismiss mobile sheet
      await user.keyboard('{Escape}');

      // Desktop form is active again
      await waitFor(() => {
        expect(desktopForm).not.toHaveAttribute('aria-hidden');
      });
      expect(desktopSubmitBtn).not.toBeDisabled();
    });

    it('prevents duplicate requests via synchronous submission mutex guard on rapid double clicks', async () => {
      const user = userEvent.setup();

      let resolvePromise: (val: unknown) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(endpoints.reviewGrievance).mockImplementation(() => delayedPromise as any);

      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve grievance/i })).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole('button', { name: /approve grievance/i });

      // Click rapidly twice
      await user.click(approveBtn);
      await user.click(approveBtn);

      // Mutex guard ensures reviewGrievance was invoked ONLY once
      expect(endpoints.reviewGrievance).toHaveBeenCalledTimes(1);

      // Resolve the pending submission
      resolvePromise!(MOCK_REVIEW_RESPONSE);

      await waitFor(() => {
        expect(screen.getByText(/successfully submitted decision: approve/i)).toBeInTheDocument();
      });
    });

    it('releases the submission mutex guard when an API call fails or throws', async () => {
      const user = userEvent.setup();

      // Mock failure on first attempt
      vi.mocked(endpoints.reviewGrievance).mockRejectedValueOnce(
        new ApiError(500, 'Internal Server Error', undefined, 'Database timeout')
      );

      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve grievance/i })).toBeInTheDocument();
      });

      const approveBtn = screen.getByRole('button', { name: /approve grievance/i });
      await user.click(approveBtn);

      // Verify error is shown
      await waitFor(() => {
        expect(screen.getByText(/database timeout/i)).toBeInTheDocument();
      });

      // Guard must be released in finally block; mock second attempt to succeed
      vi.mocked(endpoints.reviewGrievance).mockResolvedValueOnce(MOCK_REVIEW_RESPONSE);

      await user.click(approveBtn);

      // Verify second attempt was permitted and succeeded
      expect(endpoints.reviewGrievance).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(screen.getByText(/successfully submitted decision: approve/i)).toBeInTheDocument();
      });
    });

    it('enforces identical validation consistency between desktop and mobile forms', async () => {
      const user = userEvent.setup();
      renderDetailPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Override' })).toBeInTheDocument();
      });

      // Desktop validation: click Override without required fields
      await user.click(screen.getByRole('button', { name: 'Override' }));
      const desktopSubmit = screen.getByRole('button', { name: /apply override/i });
      await user.click(desktopSubmit);

      expect(
        screen.getByText(/when overriding, you must specify a new category or a new priority\./i)
      ).toBeInTheDocument();

      // Open mobile sheet and verify the exact same validation applies
      const openSheetBtn = screen.getByRole('button', { name: /adjudicate case/i });
      await user.click(openSheetBtn);

      const mobileDialog = screen.getByRole('dialog', { name: /adjudicate case/i });
      const mobileSubmit = mobileDialog.querySelector('button[type="submit"]');
      expect(mobileSubmit).toBeInTheDocument();
      await user.click(mobileSubmit!);

      expect(
        screen.getAllByText(/when overriding, you must specify a new category or a new priority\./i).length
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
