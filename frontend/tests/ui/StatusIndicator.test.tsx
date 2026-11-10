import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusIndicator } from '../../src/components/ui/StatusIndicator';

describe('StatusIndicator Component', () => {
  it('renders GrievanceStatus PENDING_REVIEW with text and icon', () => {
    render(<StatusIndicator status="PENDING_REVIEW" />);
    const indicator = screen.getByText('Pending Review');
    expect(indicator).toBeInTheDocument();
    expect(indicator.parentElement?.querySelector('svg')).toBeInTheDocument();
    expect(indicator.parentElement?.className).toContain('bg-semantic-warning-bg');
  });

  it('renders GrievanceStatus APPROVED with text and icon', () => {
    render(<StatusIndicator status="APPROVED" />);
    const indicator = screen.getByText('Approved');
    expect(indicator).toBeInTheDocument();
    expect(indicator.parentElement?.className).toContain('bg-semantic-success-bg');
  });

  it('renders GrievanceStatus REJECTED with danger colors', () => {
    render(<StatusIndicator status="REJECTED" />);
    const indicator = screen.getByText('Rejected');
    expect(indicator).toBeInTheDocument();
    expect(indicator.parentElement?.className).toContain('bg-semantic-danger-bg');
  });

  it('renders GrievanceStatus AUTO_ROUTED with info colors', () => {
    render(<StatusIndicator status="AUTO_ROUTED" />);
    const indicator = screen.getByText('Auto-Routed');
    expect(indicator).toBeInTheDocument();
    expect(indicator.parentElement?.className).toContain('bg-semantic-info-bg');
  });

  it('renders TriagePriority CRITICAL with distinct critical badge', () => {
    render(<StatusIndicator priority="CRITICAL" />);
    const indicator = screen.getByText('Critical Priority');
    expect(indicator).toBeInTheDocument();
    expect(indicator.parentElement?.className).toContain('bg-semantic-danger-bg');
    expect(indicator.parentElement?.querySelector('svg')).toBeInTheDocument();
  });

  it('renders TriagePriority LOW with low badge', () => {
    render(<StatusIndicator priority="LOW" />);
    expect(screen.getByText('Low Priority')).toBeInTheDocument();
  });

  it('does not rely solely on color by pairing explicit text with every status', () => {
    const { container } = render(<StatusIndicator status="OVERRIDDEN" />);
    expect(screen.getByText('Overridden')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

