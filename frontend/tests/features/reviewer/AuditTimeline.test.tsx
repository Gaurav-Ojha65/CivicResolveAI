import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AuditTimeline } from '../../../src/features/reviewer/components/AuditTimeline';
import { AuditHistoryItem } from '../../../src/types/grievance';

describe('AuditTimeline', () => {
  it('renders empty fallback when audit history is empty', () => {
    render(
      <AuditTimeline
        auditHistory={[]}
        submittedAt="2026-11-01T12:00:00Z"
        initialCategory="Mortgage"
        initialPriority="HIGH"
      />
    );

    expect(screen.getByText(/Immutable Case Audit Trail/i)).toBeInTheDocument();
    expect(screen.getByText(/0 events/i)).toBeInTheDocument();
    expect(screen.getByText(/Initial automated intake recorded/i)).toBeInTheDocument();
  });

  it('renders chronological audit history entries with system intake and reviewer actions', () => {
    const history: AuditHistoryItem[] = [
      {
        id: 1,
        actor: 'SYSTEM_INTAKE',
        action: 'AUTO_TRIAGE',
        previousStatus: null,
        newStatus: 'PENDING_REVIEW',
        previousCategory: null,
        newCategory: 'Mortgage',
        previousPriority: null,
        newPriority: 'HIGH',
        reviewNote: null,
        timestamp: '2026-11-01T12:00:05Z',
      },
      {
        id: 2,
        actor: 'reviewer_jane',
        action: 'OVERRIDE',
        previousStatus: 'PENDING_REVIEW',
        newStatus: 'OVERRIDDEN',
        previousCategory: 'Mortgage',
        newCategory: 'Debt collection',
        previousPriority: 'HIGH',
        newPriority: 'CRITICAL',
        reviewNote: 'Customer notes foreclosure action initiated by debt collector.',
        timestamp: '2026-11-01T14:30:00Z',
      },
      {
        id: 3,
        actor: 'reviewer_jane',
        action: 'APPROVE',
        previousStatus: 'OVERRIDDEN',
        newStatus: 'APPROVED',
        previousCategory: 'Debt collection',
        newCategory: 'Debt collection',
        previousPriority: 'CRITICAL',
        newPriority: 'CRITICAL',
        reviewNote: 'Routing confirmed to specialized debt defense unit.',
        timestamp: '2026-11-01T14:35:00Z',
      },
    ];

    render(
      <AuditTimeline
        auditHistory={history}
        submittedAt="2026-11-01T12:00:00Z"
      />
    );

    expect(screen.getByText('3 events')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM_INTAKE')).toBeInTheDocument();
    expect(screen.getAllByText('reviewer_jane').length).toBe(2);
    expect(screen.getByText('OVERRIDE')).toBeInTheDocument();
    expect(screen.getByText('APPROVE')).toBeInTheDocument();
    expect(screen.getByText(/Mortgage → Debt collection/i)).toBeInTheDocument();
    expect(screen.getByText(/HIGH → CRITICAL/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Customer notes foreclosure action initiated by debt collector./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Routing confirmed to specialized debt defense unit./i)
    ).toBeInTheDocument();
  });
});
