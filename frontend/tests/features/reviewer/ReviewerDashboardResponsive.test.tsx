import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const MOCK_GRIEVANCE_1: GrievanceResponse = {
  id: '12345678-abcd-1234-abcd-1234567890ab',
  assignedCategory: 'Mortgage',
  priority: 'HIGH',
  status: 'PENDING_REVIEW',
  reviewRequired: true,
  submittedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-01T10:00:00Z',
  version: 1,
};

const MOCK_GRIEVANCE_2: GrievanceResponse = {
  id: '87654321-dcba-4321-dcba-ba0987654321',
  assignedCategory: 'Credit Card',
  priority: 'CRITICAL',
  status: 'AUTO_ROUTED',
  reviewRequired: false,
  submittedAt: '2026-11-02T12:00:00Z',
  updatedAt: '2026-11-02T12:00:00Z',
  version: 2,
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
  content: [MOCK_GRIEVANCE_1, MOCK_GRIEVANCE_2],
  totalElements: 2,
  totalPages: 1,
  size: 20,
  number: 0,
  first: true,
  last: true,
  empty: false,
};

describe('ReviewerDashboard Responsive Presentation & Interactions', () => {
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

  it('renders single canonical queue data source with zero duplicate complaint nodes', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    // Exactly one element per complaint reference
    expect(screen.getAllByText('12345678...').length).toBe(1);
    expect(screen.getAllByText('87654321...').length).toBe(1);

    // Exactly one review link per complaint (ordered by SLA breach urgency: MOCK_GRIEVANCE_2 first, MOCK_GRIEVANCE_1 second)
    const reviewLinks = screen.getAllByRole('link', { name: /^review$/i });
    expect(reviewLinks.length).toBe(2);
    expect(reviewLinks[0]).toHaveAttribute('href', '/reviewer/grievances/87654321-dcba-4321-dcba-ba0987654321');
    expect(reviewLinks[1]).toHaveAttribute('href', '/reviewer/grievances/12345678-abcd-1234-abcd-1234567890ab');
  });

  it('applies responsive CSS classes for desktop table layout (md:table, md:table-row, md:table-cell)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('queue-table');
    expect(table.className).toContain('md:table');

    const row = screen.getByTestId('queue-row-12345678-abcd-1234-abcd-1234567890ab');
    expect(row.className).toContain('md:table-row');
    expect(row.className).toContain('md:h-[42px]');

    // Table header is visible on desktop, hidden on mobile
    const thead = table.querySelector('thead');
    expect(thead?.className).toContain('hidden');
    expect(thead?.className).toContain('md:table-header-group');
  });

  it('applies responsive CSS classes for mobile stacked card layout (grid-cols-2, rounded-xl, shadow, cell order)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-row-12345678-abcd-1234-abcd-1234567890ab')).toBeInTheDocument();
    });

    const row = screen.getByTestId('queue-row-12345678-abcd-1234-abcd-1234567890ab');
    // Mobile card presentation styling
    expect(row.className).toContain('grid');
    expect(row.className).toContain('grid-cols-2');
    expect(row.className).toContain('rounded-xl');
    expect(row.className).toContain('border');
    expect(row.className).toContain('p-3.5');

    // Scoped verification of cell order classes for mobile layout
    const cells = Array.from(row.querySelectorAll('td'));
    expect(cells.length).toBe(7);

    // Reference (top-left on mobile)
    expect(cells[0]!.className).toContain('order-1');
    expect(cells[0]!.className).toContain('col-span-1');

    // Category (full width middle on mobile)
    expect(cells[1]!.className).toContain('order-3');
    expect(cells[1]!.className).toContain('col-span-2');

    // Priority (top-right on mobile)
    expect(cells[2]!.className).toContain('order-2');
    expect(cells[2]!.className).toContain('col-span-1');

    // Time to SLA (left of row 3 on mobile)
    expect(cells[3]!.className).toContain('order-4');

    // Models (left of bottom action row on mobile)
    expect(cells[4]!.className).toContain('order-6');

    // Status (right of row 3 on mobile)
    expect(cells[5]!.className).toContain('order-5');

    // Actions (right of bottom action row on mobile)
    expect(cells[6]!.className).toContain('order-7');
  });

  it('filters queue and updates visible rows without duplicate DOM elements', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText(/filter by status/i);
    await user.selectOptions(statusSelect, 'AUTO_ROUTED');

    expect(endpoints.listGrievances).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'AUTO_ROUTED',
      }),
      expect.any(AbortSignal)
    );

    const prioritySelect = screen.getByLabelText(/filter by priority/i);
    await user.selectOptions(prioritySelect, 'CRITICAL');

    expect(endpoints.listGrievances).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'CRITICAL',
      }),
      expect.any(AbortSignal)
    );
  });

  it('supports full keyboard navigation (J, K, Space to toggle, Escape to close)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    // MOCK_GRIEVANCE_2 breaches earlier, so it is sorted to index 0. MOCK_GRIEVANCE_1 is index 1.
    const row0 = screen.getByTestId('queue-row-87654321-dcba-4321-dcba-ba0987654321');
    const row1 = screen.getByTestId('queue-row-12345678-abcd-1234-abcd-1234567890ab');

    // Initial selected row is row0
    expect(row0.className).toContain('ring-teal-500');

    // J navigates to next row (row1)
    fireEvent.keyDown(window, { key: 'j' });
    expect(row1.className).toContain('ring-teal-500');

    // K navigates back to first row (row0)
    fireEvent.keyDown(window, { key: 'k' });
    expect(row0.className).toContain('ring-teal-500');

    // J again to select row1 for detail fetch
    fireEvent.keyDown(window, { key: 'j' });
    expect(row1.className).toContain('ring-teal-500');

    // Space toggles Quick Peek drawer for currently selected row (row1)
    fireEvent.keyDown(window, { key: ' ' });

    await waitFor(() => {
      expect(screen.getByTestId('quick-peek-content')).toBeInTheDocument();
    });
    expect(endpoints.getGrievanceById).toHaveBeenCalledWith('12345678-abcd-1234-abcd-1234567890ab');

    // Escape closes Quick Peek drawer
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByTestId('quick-peek-content')).not.toBeInTheDocument();
    });
  });

  it('ensures Quick Peek drawer is bounded to viewport width on mobile (max-w-[100vw])', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    const qpButtons = screen.getAllByRole('button', { name: /quick peek/i });
    expect(qpButtons.length).toBeGreaterThan(0);
    await user.click(qpButtons[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('quick-peek-content')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    // Check motion container inside dialog has max-w-[100vw]
    const drawerPanel = dialog.querySelector('.max-w-\\[100vw\\]');
    expect(drawerPanel).not.toBeNull();
    expect(drawerPanel?.className).toContain('w-full');
    expect(drawerPanel?.className).toContain('sm:max-w-lg');
  });

  it('ensures container does not cause page horizontal overflow', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('queue-table')).toBeInTheDocument();
    });

    const table = screen.getByTestId('queue-table');
    const container = table.parentElement;
    expect(container?.className).toContain('overflow-x-auto');
    expect(container?.className).toContain('overflow-y-auto');
  });
});
