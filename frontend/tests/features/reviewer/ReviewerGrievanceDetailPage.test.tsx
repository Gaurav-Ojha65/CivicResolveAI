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
        screen.getByText(/conflict \(http 409\): another reviewer has updated this grievance/i)
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
});
