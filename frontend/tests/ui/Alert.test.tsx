import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Alert } from '../../src/components/ui/Alert';

describe('Alert Component', () => {
  it('renders alert with title and content in role="alert"', () => {
    render(
      <Alert variant="danger" title="Validation Failed">
        Description is too short.
      </Alert>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Validation Failed')).toBeInTheDocument();
    expect(screen.getByText('Description is too short.')).toBeInTheDocument();
  });

  it('renders info variant by default', () => {
    render(<Alert>Informational system update.</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('bg-semantic-info-bg');
  });

  it('handles dismiss action via onClose callback', async () => {
    const handleClose = vi.fn();
    render(
      <Alert onClose={handleClose}>
        Dismissible notification
      </Alert>
    );

    const closeButton = screen.getByRole('button', { name: /dismiss alert/i });
    expect(closeButton).toBeInTheDocument();
    await userEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

