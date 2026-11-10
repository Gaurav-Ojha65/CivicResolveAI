import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../../src/components/ui/Button';

describe('Button Component', () => {
  it('renders button with text content', () => {
    render(<Button>Submit Grievance</Button>);
    expect(screen.getByRole('button', { name: /submit grievance/i })).toBeInTheDocument();
  });

  it('renders primary variant by default with trust teal styles', () => {
    render(<Button>Primary Button</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-teal-trust');
  });

  it('renders destructive variant with danger styles', () => {
    render(<Button variant="destructive">Reject Grievance</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-semantic-danger-fg');
  });

  it('handles click events when enabled', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('disables button and displays loading spinner when isLoading is true', async () => {
    const handleClick = vi.fn();
    render(
      <Button isLoading onClick={handleClick}>
        Processing
      </Button>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg')).toBeInTheDocument();

    await userEvent.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('supports left and right icons', () => {
    render(
      <Button
        leftIcon={<span data-testid="left-icon">L</span>}
        rightIcon={<span data-testid="right-icon">R</span>}
      >
        Icon Button
      </Button>
    );

    expect(screen.getByTestId('left-icon')).toBeInTheDocument();
    expect(screen.getByTestId('right-icon')).toBeInTheDocument();
  });

  it('has accessible focus ring classes for keyboard navigation', () => {
    render(<Button>Accessible Focus</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('focus-visible:outline-focus');
  });
});

