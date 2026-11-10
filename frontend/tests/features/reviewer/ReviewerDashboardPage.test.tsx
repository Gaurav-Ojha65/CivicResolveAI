import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ReviewerDashboardPage } from '../../../src/features/reviewer/ReviewerDashboardPage';
import {
  GrievanceStatsResponse,
  GrievanceResponse,
  GrievanceDetailResponse,
  SpringPage,
} from '../../../src/types/grievance';
import * as endpoints from '../../../src/lib/api/endpoints';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';
import { ApiError } from '../../../src/lib/errors/api-error';

vi.mock('../../../src/lib/api/endpoints', () => ({
  getGrievanceStats: vi.fn(),
  listGrievances: vi.fn(),
  getGrievanceById: vi.fn(),
  getSystemStatus: vi.fn(),
  seedDemoTelemetry: vi.fn(),
}));

const MOCK_STATS: GrievanceStatsResponse = {
  total: 42,
  pendingReview: 12,
  byStatus: {
    PENDING_REVIEW: 12,
    APPROVED: 18,
    OVERRIDDEN: 5,
    REJECTED: 3,
    AUTO_ROUTED: 4,
  },
  byPriority: {
    CRITICAL: 5,
    HIGH: 9,
    MEDIUM: 18,
    LOW: 10,
  },
};

const MOCK_GRIEVANCE: GrievanceResponse = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  assignedCategory: 'Mortgage',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  version: 1,
};

const MOCK_GRIEVANCE_DETAIL: GrievanceDetailResponse = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  narrative: 'I was improperly charged an unexpected escrow shortage fee by the loan servicer.',
  assignedCategory: 'Mortgage',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  version: 1,
  originalPrediction: {
    predictedCategory: 'Mortgage',
    modelUsed: 'LogisticRegression',
    modelVersion: '1.0.0',
    confidence: 0.88,
    margin: 0.28,
    probabilities: { Mortgage: 0.88, 'Debt collection': 0.12 },
    flagForReview: false,
    reviewReasons: [],
    triagePriority: 'HIGH',
    priorityReasons: ['High escrow impact'],
    sentimentScore: -0.65,
    sentimentLabel: 'NEGATIVE',
    predictedAt: '2026-11-01T10:00:00Z',
    explanation: {
      predictedClass: 'Mortgage',
      predictedDecisionScore: 1.45,
      predictedIntercept: 0.12,
      runnerUpClass: 'Debt collection',
      runnerUpDecisionScore: 0.35,
      runnerUpIntercept: -0.05,
      decisionScoreMargin: 1.1,
      topPositiveFeatures: [
        { feature: 'escrow', contribution: 0.42 },
        { feature: 'servicer', contribution: 0.38 },
      ],
      topNegativeFeatures: [
        { feature: 'collection', contribution: -0.15 },
      ],
      topDifferenceFeatures: [],
      modelProvenanceSha256: 'abc123sha',
      explanationGeneratedAt: '2026-11-01T10:00:00Z',
    },
  },
};

const MOCK_PAGE: SpringPage<GrievanceResponse> = {
  content: [MOCK_GRIEVANCE],
  totalElements: 1,
  totalPages: 1,
  size: 20,
  number: 0,
  first: true,
  last: true,
  empty: false,
};

describe('ReviewerDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: { username: 'reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    vi.mocked(endpoints.getGrievanceStats).mockResolvedValue(MOCK_STATS);
    vi.mocked(endpoints.listGrievances).mockResolvedValue(MOCK_PAGE);
    vi.mocked(endpoints.getGrievanceById).mockResolvedValue(MOCK_GRIEVANCE_DETAIL);
    vi.mocked(endpoints.getSystemStatus).mockResolvedValue({
      backendStatus: 'HEALTHY',
      databaseSchemaVersion: 'V6',
      nlpServiceReachable: true,
      nlpProbeLatencyMs: 14.2,
      activeModelName: 'baseline_tfidf_logreg',
      serverTimestamp: '2026-11-11T00:00:00Z',
      demoBatchSeeded: false,
    });
  });

  function renderDashboard() {
    return render(
      <MemoryRouter initialEntries={['/reviewer']}>
        <ReviewerDashboardPage />
      </MemoryRouter>
    );
  }

  it('loads and renders dashboard statistics and queue records', async () => {
    renderDashboard();

    // Verify stats
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getAllByText('12').length).toBeGreaterThan(0);
      expect(screen.getAllByText('18').length).toBeGreaterThan(0);
    });

    // Verify table row
    expect(screen.getByText('12345678...')).toBeInTheDocument();
    expect(screen.getByText('Mortgage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^review$/i })).toHaveAttribute(
      'href',
      '/reviewer/grievances/12345678-abcd-1234-abcd-1234567890ab'
    );
  });

  it('renders empty state when queue returns zero complaints', async () => {
    vi.mocked(endpoints.listGrievances).mockResolvedValueOnce({
      content: [],
      totalElements: 0,
      totalPages: 0,
      size: 20,
      number: 0,
      first: true,
      last: true,
      empty: true,
    });

    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText(/no grievances match the filter criteria/i)
      ).toBeInTheDocument();
    });
  });

  it('displays error state when stats fail to load and allows retry', async () => {
    vi.mocked(endpoints.getGrievanceStats).mockRejectedValueOnce(
      new ApiError(500, 'Internal Server Error', undefined, 'Stats database failure')
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/unable to load statistics/i)).toBeInTheDocument();
    });

    vi.mocked(endpoints.getGrievanceStats).mockResolvedValueOnce(MOCK_STATS);
    const user = userEvent.setup();
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
    });
  });

  it('triggers queue refetch on status filter selection', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('12345678...')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await user.selectOptions(statusSelect, 'PENDING_REVIEW');

    expect(endpoints.listGrievances).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0,
        size: 20,
        status: 'PENDING_REVIEW',
      }),
      expect.any(AbortSignal)
    );
  });

  it('triggers queue refetch on priority filter selection', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('12345678...')).toBeInTheDocument();
    });

    const prioritySelect = screen.getByLabelText(/filter by priority/i);
    await user.selectOptions(prioritySelect, 'CRITICAL');

    expect(endpoints.listGrievances).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 0,
        size: 20,
        priority: 'CRITICAL',
      }),
      expect.any(AbortSignal)
    );
  });

  it('paginates when Next button is clicked', async () => {
    vi.mocked(endpoints.listGrievances).mockResolvedValueOnce({
      ...MOCK_PAGE,
      totalElements: 40,
      totalPages: 2,
      last: false,
    });

    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /next/i }));

    expect(endpoints.listGrievances).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
      }),
      expect.any(AbortSignal)
    );
  });

  it('triggers detail fetch on first Quick Peek click and renders preview content', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('12345678...')).toBeInTheDocument();
    });

    const quickPeekBtn = screen.getByRole('button', { name: /quick peek/i });
    expect(quickPeekBtn).toBeInTheDocument();

    await user.click(quickPeekBtn);

    expect(endpoints.getGrievanceById).toHaveBeenCalledWith('12345678-abcd-1234-abcd-1234567890ab');

    await waitFor(() => {
      expect(screen.getByTestId('quick-peek-content')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/escrow shortage fee/i)
    ).toBeInTheDocument();
    expect(screen.getByText('+escrow')).toBeInTheDocument();
    expect(screen.getByText('collection')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open investigation lab/i })).toHaveAttribute(
      'href',
      '/reviewer/grievances/12345678-abcd-1234-abcd-1234567890ab'
    );
  });

  it('collapsing and re-expanding uses cached data with zero duplicate network calls', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('12345678...')).toBeInTheDocument();
    });

    const quickPeekBtn = screen.getByRole('button', { name: /quick peek/i });
    await user.click(quickPeekBtn);

    await waitFor(() => {
      expect(screen.getByTestId('quick-peek-content')).toBeInTheDocument();
    });
    expect(endpoints.getGrievanceById).toHaveBeenCalledTimes(1);

    // Collapse
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('quick-peek-content')).not.toBeInTheDocument();
    });

    // Re-expand: Should use cached Map and NOT call getGrievanceById again
    const reopenBtn = screen.getByRole('button', { name: /quick peek/i });
    await user.click(reopenBtn);

    await waitFor(() => {
      expect(screen.getByTestId('quick-peek-content')).toBeInTheDocument();
    });
    expect(endpoints.getGrievanceById).toHaveBeenCalledTimes(1);
  });

  it('renders shimmer skeletons during loading states', async () => {
    // Hold grievances, stats, and telemetry unresolved to test pure skeleton render
    vi.mocked(endpoints.listGrievances).mockReturnValue(new Promise(() => {}));
    vi.mocked(endpoints.getGrievanceStats).mockReturnValue(new Promise(() => {}));
    vi.mocked(endpoints.getSystemStatus).mockReturnValue(new Promise(() => {}));

    renderDashboard();

    expect(screen.getByTestId('stats-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('queue-skeleton')).toBeInTheDocument();
  });
});
