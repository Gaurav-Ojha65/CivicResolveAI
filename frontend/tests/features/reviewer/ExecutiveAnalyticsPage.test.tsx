import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutiveAnalyticsPage } from '../../../src/features/reviewer/ExecutiveAnalyticsPage';
import * as endpoints from '../../../src/lib/api/endpoints';
import { ExecutiveAnalyticsResponse } from '../../../src/types/grievance';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';

vi.mock('../../../src/lib/api/endpoints', () => ({
  getSystemStatus: vi.fn(),
  getExecutiveAnalytics: vi.fn(),
  seedDemoTelemetry: vi.fn(),
}));

describe('ExecutiveAnalyticsPage', () => {
  const sampleAnalytics: ExecutiveAnalyticsResponse = {
    totalComplaints: 100,
    pendingReview: 25,
    autoRouted: 75,
    humanReviewed: 40,
    autoRoutingEfficiencyRate: 0.75,
    slaComplianceRate: 0.92,
    priorityDistribution: { LOW: 25, MEDIUM: 25, HIGH: 25, CRITICAL: 25 },
    statusDistribution: { PENDING_REVIEW: 25, AUTO_ROUTED: 35, APPROVED: 30, OVERRIDDEN: 10, REJECTED: 0 },
    categoryVolumeMatrix: [
      {
        category: 'Debt collection',
        total: 30,
        critical: 5,
        high: 10,
        medium: 12,
        low: 3,
        autoRouted: 15,
        pendingReview: 5,
        approved: 8,
        overridden: 2,
        rejected: 0,
      },
      {
        category: 'Credit card',
        total: 20,
        critical: 2,
        high: 8,
        medium: 7,
        low: 3,
        autoRouted: 10,
        pendingReview: 5,
        approved: 5,
        overridden: 0,
        rejected: 0,
      },
    ],
    confidenceSentimentBuckets: {
      confidenceUnder55: 10,
      confidence55To75: 20,
      confidence75To90: 30,
      confidenceOver90: 40,
      narrowMargin: 15,
      clearMargin: 85,
      negativeSentiment: 70,
      neutralSentiment: 20,
      positiveSentiment: 10,
    },
    slaAgingBreakdown: {
      onTrack: 18,
      atRisk: 5,
      breached: 2,
      totalPending: 25,
    },
    dailyIntakeTrend: [
      {
        date: 'Oct 25',
        intakeCount: 10,
        autoRoutedCount: 7,
        humanReviewedCount: 3,
      },
      {
        date: 'Oct 26',
        intakeCount: 15,
        autoRoutedCount: 11,
        humanReviewedCount: 4,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: { username: 'test-reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('keeps figures and simulation hidden until analytics arrive', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockRejectedValueOnce(new Error('Snapshot unavailable'));
    render(<MemoryRouter><ExecutiveAnalyticsPage /></MemoryRouter>);
    expect(screen.getByText('Loading complaint analytics…')).toBeVisible();
    expect(await screen.findByText('Snapshot unavailable')).toBeVisible();
    expect(screen.queryByText('Total complaints')).not.toBeInTheDocument();
    expect(screen.queryByTestId('monte-carlo-stress-lab')).not.toBeInTheDocument();
  });

  it('renders executive metrics, charts, and truthful AI notice', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Complaint analytics/i)).toBeInTheDocument();
      expect(screen.getByText(/14-Day Complaint Velocity & Adjudication Trend/i)).toBeInTheDocument();
      expect(screen.getByText(/Volume & Priority Matrix/i)).toBeInTheDocument();
      expect(screen.getByText(/Pending Case Age/i)).toBeInTheDocument();
      expect(screen.getByText(/Model confidence bands/i)).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument(); // total
    });

    // Check KPIs
    expect(screen.getByText('75%')).toBeInTheDocument(); // automation rate
    expect(screen.getAllByText('40').length).toBeGreaterThan(0); // human reviewed volume
    expect(screen.getByText('72%')).toBeInTheDocument(); // share of pending cases under 24 hours

    // Truthful AI notice
    expect(screen.getByText(/uncalibrated probability estimates/i)).toBeInTheDocument();
  });

  it('calls seedDemoTelemetry when seed button and confirmation dialog are confirmed', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValue(sampleAnalytics);
    vi.mocked(endpoints.seedDemoTelemetry).mockResolvedValueOnce({
      message: 'Successfully seeded 32 complaints',
      recordsCreated: 32,
      status: 'READY',
    });

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Add demo cases/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add demo cases/i));

    // Explicit confirmation modal must appear
    const confirmDialog = await screen.findByRole('dialog', { name: /confirm synthetic demo seeding/i });
    expect(confirmDialog).toBeInTheDocument();
    expect(screen.getByText(/Idempotent Batch Operation/i)).toBeInTheDocument();

    // Click confirm button
    const confirmBtn = screen.getByRole('button', { name: /confirm & seed demo data/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(endpoints.seedDemoTelemetry).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/32 new cases added/i)).toBeInTheDocument();
    });
  });

  it('cancels seeding without calling API when Cancel is clicked in confirmation dialog', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValue(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Add demo cases/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Add demo cases/i));

    const confirmDialog = await screen.findByRole('dialog', { name: /confirm synthetic demo seeding/i });
    expect(confirmDialog).toBeInTheDocument();

    // Click Cancel
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirm synthetic demo seeding/i })).not.toBeInTheDocument();
    });
    expect(endpoints.seedDemoTelemetry).not.toHaveBeenCalled();
  });

  it('switches time horizon between 7 Days and 14 Days and keeps 30D/90D disabled', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValue(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/14-Day Complaint Velocity & Adjudication Trend/i)).toBeInTheDocument();
    });

    const btn7D = screen.getByRole('button', { name: /7 days/i });
    const btn14D = screen.getByRole('button', { name: /14 days/i });
    const btn30D = screen.getByRole('button', { name: /30d/i });
    const btn90D = screen.getByRole('button', { name: /90d/i });

    // 14D is active by default
    expect(btn14D).toHaveAttribute('aria-pressed', 'true');
    expect(btn7D).toHaveAttribute('aria-pressed', 'false');

    // 30D and 90D must be disabled to avoid fabricating missing history
    expect(btn30D).toBeDisabled();
    expect(btn90D).toBeDisabled();

    // Switch to 7D
    fireEvent.click(btn7D);
    expect(btn7D).toHaveAttribute('aria-pressed', 'true');
    expect(btn14D).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/7-Day Complaint Velocity & Adjudication Trend/i)).toBeInTheDocument();

    // Switch back to 14D
    fireEvent.click(btn14D);
    expect(btn14D).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/14-Day Complaint Velocity & Adjudication Trend/i)).toBeInTheDocument();
  });

  it('renders operational velocity summary metrics and category volume progress bars', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValue(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Period Total Inflow/i)).toBeInTheDocument();
      expect(screen.getByText(/Period Straight-Through/i)).toBeInTheDocument();
      expect(screen.getByText(/Period Human Adjudicated/i)).toBeInTheDocument();
      expect(screen.getByText(/Avg\. Daily Volume/i)).toBeInTheDocument();
    });

    // Check progress bars for categories
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(2); // Debt collection, Credit card
  });

  it('displays error state when API fails', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockRejectedValueOnce(
      new Error('Failed to retrieve executive analytics')
    );

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to retrieve executive analytics/i)).toBeInTheDocument();
    });
  });

  it('displays three-part adjudication volume breakdown (Approved, Overrides, Rejected) reconciling with humanReviewed', async () => {
    const analyticsWithRejections: ExecutiveAnalyticsResponse = {
      ...sampleAnalytics,
      humanReviewed: 40,
      statusDistribution: {
        PENDING_REVIEW: 25,
        AUTO_ROUTED: 35,
        APPROVED: 25,
        OVERRIDDEN: 10,
        REJECTED: 5,
      },
    };

    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(analyticsWithRejections);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Adjudicated Volume')).toBeInTheDocument();
    });

    const card = screen.getByText('Adjudicated Volume').closest<HTMLElement>('div.shadow-card')!;
    // Check that humanReviewed matches sum of parts (25 + 10 + 5 = 40)
    expect(within(card).getByText('40')).toBeInTheDocument();
    expect(within(card).getByText('25')).toBeInTheDocument();
    expect(within(card).getByText(/approved/i)).toBeInTheDocument();
    expect(within(card).getByText('10')).toBeInTheDocument();
    expect(within(card).getByText(/overrides/i)).toBeInTheDocument();
    expect(within(card).getByText('5')).toBeInTheDocument();
    expect(within(card).getByText(/rejected/i)).toBeInTheDocument();
  });

  it('renders descriptive queue-age bands without claiming configured deadlines', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Pending Case Age/i)).toBeInTheDocument();
    });

    const ageCard = screen.getByText('Pending Case Age').closest<HTMLElement>('div.shadow-card')!;
    expect(within(ageCard).getByText(/≤ 24 Hours/i)).toBeInTheDocument();
    expect(within(ageCard).getByText('Recent')).toBeInTheDocument();
    expect(within(ageCard).getByText(/> 24h – ≤ 72h/i)).toBeInTheDocument();
    expect(within(ageCard).getByText('Aging')).toBeInTheDocument();
    expect(within(ageCard).getByText(/> 72 Hours/i)).toBeInTheDocument();
    expect(within(ageCard).getByText('Older')).toBeInTheDocument();
    expect(within(ageCard).getByText('Operational bands')).toBeInTheDocument();
    expect(ageCard).toHaveTextContent('not legal or contractual deadlines');
    expect(screen.getByText('Pending Under 24h')).toBeInTheDocument();
    expect(screen.getByText('Pending Over 24h')).toBeInTheDocument();
    expect(screen.queryByText(/SLA Queue Aging/i)).not.toBeInTheDocument();
  });

  it('renders Straight-Through Automation Rate with explanatory denominator tooltip note', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Straight-Through Automation Rate')).toBeInTheDocument();
    });

    // Check explanatory note clarifying denominator and distinction from ML model precision
    const note = screen.getByRole('note');
    expect(note).toBeInTheDocument();
    expect(note).toHaveAttribute(
      'title',
      'Percentage of all ingested grievances currently classified as AUTO_ROUTED. Measures volume routing proportion, not model prediction accuracy or precision.'
    );
  });

  it('renders on-demand telemetry badges and initial last updated timestamp', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('On-demand report')).toBeInTheDocument();
    });

    expect(screen.getByText('Based on stored cases')).toBeInTheDocument();
    expect(screen.getAllByText('Snapshot').length).toBeGreaterThanOrEqual(3);

    // Ensure misleading continuous streaming claims are NOT present
    expect(screen.queryByText(/Live Operational Queue/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Real-time DB Counts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Queue Data/i)).not.toBeInTheDocument();

    // Timestamp is rendered
    expect(screen.getByText(/Last Updated:/i)).toBeInTheDocument();
  });

  it('updates timestamp after successful manual refresh and preserves previous timestamp when refresh fails', async () => {
    const toLocaleTimeStringSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString');
    toLocaleTimeStringSpy.mockReturnValueOnce('10:00:00 AM');

    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValue(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Last Updated: 10:00:00 AM/i)).toBeInTheDocument();
    });

    const refreshBtn = screen.getAllByRole('button', { name: /refresh/i })[0]!;

    // Set next return value for manual refresh
    toLocaleTimeStringSpy.mockReturnValueOnce('10:05:30 AM');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Last Updated: 10:05:30 AM/i)).toBeInTheDocument();
    });

    // Now make next fetch fail
    toLocaleTimeStringSpy.mockReturnValueOnce('10:15:00 AM');
    vi.mocked(endpoints.getExecutiveAnalytics).mockRejectedValueOnce(
      new Error('Transient database network timeout')
    );

    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText(/Transient database network timeout/i)).toBeInTheDocument();
    });

    // Failed fetch must NOT update timestamp to 10:15:00 AM; previous 10:05:30 AM timestamp must be preserved
    expect(screen.getByText(/Last Updated: 10:05:30 AM/i)).toBeInTheDocument();
    expect(screen.queryByText(/Last Updated: 10:15:00 AM/i)).not.toBeInTheDocument();

    toLocaleTimeStringSpy.mockRestore();
  });
});
