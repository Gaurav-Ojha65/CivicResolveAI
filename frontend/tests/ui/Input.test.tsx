import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Input } from '../../src/components/ui/Input';
import { Label } from '../../src/components/ui/Label';

describe('Input Component', () => {
  it('renders input with default placeholder', () => {
    render(<Input placeholder="Enter complaint" />);
    expect(screen.getByPlaceholderText('Enter complaint')).toBeInTheDocument();
  });

  it('updates value on user typing', async () => {
    render(<Input placeholder="Type here" />);
    const input = screen.getByPlaceholderText('Type here');
    await userEvent.type(input, 'Credit card fee disputed');
    expect(input).toHaveValue('Credit card fee disputed');
  });

  it('renders invalid state with error message and accessible attributes', () => {
    render(
      <div>
        <Label htmlFor="complaint-input" required>
          Complaint
        </Label>
        <Input
          id="complaint-input"
          isInvalid
          errorMessage="Description must be between 10 and 5000 characters."
        />
      </div>
    );

    const input = screen.getByRole('textbox', { name: /complaint/i });
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(
      'Description must be between 10 and 5000 characters.'
    );
    expect(input).toHaveAttribute('aria-describedby', expect.stringContaining('-error'));
  });

  it('renders helper text when valid', () => {
    render(
      <Input
        id="helper-test"
        helperText="Provide specific transaction dates and amounts."
      />
    );

    expect(
      screen.getByText('Provide specific transaction dates and amounts.')
    ).toBeInTheDocument();
  });

  it('respects disabled state', () => {
    render(<Input disabled placeholder="Locked input" />);
    expect(screen.getByPlaceholderText('Locked input')).toBeDisabled();
  });
});

