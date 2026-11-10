import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandPaletteModal } from '../../../src/features/reviewer/components/CommandPaletteModal';
import * as endpoints from '../../../src/lib/api/endpoints';
import { SystemStatusResponse, GrievanceResponse } from '../../../src/types/grievance';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../../src/lib/api/endpoints', () => ({
  listGrievances: vi.fn(),
  seedDemoTelemetry: vi.fn(),
}));

describe('CommandPaletteModal', () => {
  const mockSystemStatusUnseeded: SystemStatusResponse = {
    backendStatus: 'UP',
    databaseSchemaVersion: 'V6',
    nlpServiceReachable: true,
    nlpProbeLatencyMs: 14.5,
    activeModelName: 'baseline_tfidf_logreg',
    serverTimestamp: '2026-11-10T12:00:00Z',
    demoBatchSeeded: false,
  };

  const mockSystemStatusSeeded: SystemStatusResponse = {
    ...mockSystemStatusUnseeded,
    demoBatchSeeded: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={false}
          onClose={vi.fn()}
          systemStatus={mockSystemStatusUnseeded}
        />
      </MemoryRouter>
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders search input and static routes when open', () => {
    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={vi.fn()}
          systemStatus={mockSystemStatusUnseeded}
        />
      </MemoryRouter>
    );

    expect(screen.getByPlaceholderText(/Search complaint ID, category, or command/i)).toBeInTheDocument();
    expect(screen.getByText('Reviewer Overview & Queue')).toBeInTheDocument();
    expect(screen.getByText('AI Audit & Model Calibration')).toBeInTheDocument();
    expect(screen.getByText('Executive Analytics & Telemetry')).toBeInTheDocument();
    expect(screen.getByText('Citizen Public Intake Portal')).toBeInTheDocument();
    expect(screen.getByText('Load Synthetic Demo Cases')).toBeInTheDocument();
  });

  it('navigates to route when route item is clicked', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={onClose}
          systemStatus={mockSystemStatusUnseeded}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('AI Audit & Model Calibration'));

    expect(mockNavigate).toHaveBeenCalledWith('/reviewer/audit');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Load Demo Cases as disabled with badge when already seeded', () => {
    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={vi.fn()}
          systemStatus={mockSystemStatusSeeded}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Already Seeded')).toBeInTheDocument();
  });

  it('prompts confirmation when Load Demo Cases is clicked on unseeded system', async () => {
    vi.mocked(endpoints.seedDemoTelemetry).mockResolvedValueOnce({
      status: 'success',
      message: 'Seeded 32 complaints',
      recordsCreated: 32,
    });
    const onRefresh = vi.fn();

    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={vi.fn()}
          systemStatus={mockSystemStatusUnseeded}
          onStatusRefresh={onRefresh}
        />
      </MemoryRouter>
    );

    // Click on Load Demo Cases
    fireEvent.click(screen.getByText('Load Synthetic Demo Cases'));

    // Confirmation prompt appears
    expect(screen.getByText('Confirm Synthetic Telemetry Seeding')).toBeInTheDocument();

    // Confirm button
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Seed/i }));

    await waitFor(() => {
      expect(endpoints.seedDemoTelemetry).toHaveBeenCalledWith(true);
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('performs debounced search and displays matched complaint results', async () => {
    const sampleCase: GrievanceResponse = {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      assignedCategory: 'Debt collection',
      priority: 'CRITICAL',
      status: 'PENDING_REVIEW',
      submittedAt: '2026-11-10T10:00:00Z',
      reviewRequired: true,
      updatedAt: '2026-11-10T10:00:00Z',
    };

    vi.mocked(endpoints.listGrievances).mockResolvedValueOnce({
      content: [sampleCase],
      totalElements: 1,
      totalPages: 1,
      size: 5,
      number: 0,
      first: true,
      last: true,
      empty: false,
    });

    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={vi.fn()}
          systemStatus={mockSystemStatusUnseeded}
        />
      </MemoryRouter>
    );

    const input = screen.getByPlaceholderText(/Search complaint ID, category, or command/i);
    fireEvent.change(input, { target: { value: 'debt' } });

    await waitFor(() => {
      expect(endpoints.listGrievances).toHaveBeenCalledWith({ search: 'debt', size: 5 });
      expect(screen.getByText(/ID: a1b2c3d4/i)).toBeInTheDocument();
    });
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <CommandPaletteModal
          isOpen={true}
          onClose={onClose}
          systemStatus={mockSystemStatusUnseeded}
        />
      </MemoryRouter>
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });
});
