import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutiveAnalyticsPage } from '../../../src/features/reviewer/ExecutiveAnalyticsPage';
import * as endpoints from '../../../src/lib/api/endpoints';
import { ExecutiveAnalyticsResponse } from '../../../src/types/grievance';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';

vi.mock('../../../src/lib/api/endpoints', () => ({
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

  it('renders executive metrics, charts, and truthful AI notice', async () => {
    vi.mocked(endpoints.getExecutiveAnalytics).mockResolvedValueOnce(sampleAnalytics);

    render(
      <MemoryRouter>
        <ExecutiveAnalyticsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Grievance Intake & AI Triage Intelligence Hub/i)).toBeInTheDocument();
      expect(screen.getByText(/14-Day Complaint Velocity & Adjudication Trend/i)).toBeInTheDocument();
      expect(screen.getByText(/Volume & Priority Matrix/i)).toBeInTheDocument();
      expect(screen.getByText(/SLA Queue Aging/i)).toBeInTheDocument();
      expect(screen.getByText(/Confidence Calibration Bands/i)).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument(); // total
    });

    // Check KPIs
    expect(screen.getByText('75%')).toBeInTheDocument(); // automation rate
    expect(screen.getAllByText('40').length).toBeGreaterThan(0); // human reviewed volume
    expect(screen.getByText('92%')).toBeInTheDocument(); // sla compliance rate

    // Truthful AI notice
    expect(screen.getByText(/Uncalibrated model probability estimates/i)).toBeInTheDocument();
  });

  it('calls seedDemoTelemetry when seed button is clicked', async () => {
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
      expect(screen.getByText(/Seed Realistic CFPB Demo/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Seed Realistic CFPB Demo/i));

    await waitFor(() => {
      expect(endpoints.seedDemoTelemetry).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Successfully seeded 32 complaints/i)).toBeInTheDocument();
    });
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
});
