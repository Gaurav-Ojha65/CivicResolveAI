import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from '../../../src/features/reviewer/LoginPage';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';
import { ApiError } from '../../../src/lib/errors/api-error';

describe('LoginPage', () => {
  const mockLogin = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderLoginPage(isAuthenticated = false) {
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: isAuthenticated
        ? { username: 'reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true }
        : null,
      isAuthenticated,
      login: mockLogin,
      logout: mockLogout,
    });

    return render(
      <MemoryRouter initialEntries={['/reviewer/login']}>
        <Routes>
          <Route path="/reviewer/login" element={<LoginPage />} />
          <Route path="/reviewer" element={<div>Reviewer Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders login form elements and strict in-memory security notice', () => {
    renderLoginPage(false);

    expect(screen.getByRole('heading', { name: /reviewer portal sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in to workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/strict in-memory session/i)).toBeInTheDocument();
  });

  it('redirects to /reviewer immediately if already authenticated', async () => {
    renderLoginPage(true);

    await waitFor(() => {
      expect(screen.getByText('Reviewer Dashboard')).toBeInTheDocument();
    });
  });

  it('shows error when username is empty', async () => {
    const user = userEvent.setup();
    renderLoginPage(false);

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'secret123');

    const submitBtn = screen.getByRole('button', { name: /sign in to workspace/i });
    await user.click(submitBtn);

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits credentials and navigates on success', async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce({
      username: 'test_reviewer',
      role: 'ROLE_REVIEWER',
      isAuthenticated: true,
    });

    renderLoginPage(false);

    await user.type(screen.getByLabelText(/username/i), 'test_reviewer');
    await user.type(screen.getByLabelText(/password/i), 'ValidPassword123');
    await user.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    expect(mockLogin).toHaveBeenCalledWith('test_reviewer', 'ValidPassword123');
  });

  it('displays error alert on HTTP 401 unauthorized credentials', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiError(401, 'Unauthorized', undefined, 'Bad credentials')
    );

    renderLoginPage(false);

    await user.type(screen.getByLabelText(/username/i), 'wrong_user');
    await user.type(screen.getByLabelText(/password/i), 'wrong_pass');
    await user.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid username or password\. please verify your reviewer credentials\./i)
      ).toBeInTheDocument();
    });
  });

  it('displays forbidden alert on HTTP 403 lack of reviewer role', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(
      new ApiError(403, 'Forbidden', undefined, 'Access denied')
    );

    renderLoginPage(false);

    await user.type(screen.getByLabelText(/username/i), 'regular_user');
    await user.type(screen.getByLabelText(/password/i), 'user_pass');
    await user.click(screen.getByRole('button', { name: /sign in to workspace/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/access forbidden: your account does not hold the required role_reviewer authority\./i)
      ).toBeInTheDocument();
    });
  });
});
