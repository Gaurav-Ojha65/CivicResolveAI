import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../../../src/features/reviewer/ProtectedRoute';
import * as AuthProviderModule from '../../../src/app/providers/AuthProvider';

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to /reviewer/login', () => {
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/reviewer']}>
        <Routes>
          <Route
            path="/reviewer"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/reviewer/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders child components when user is authenticated', () => {
    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: { username: 'test_reviewer', role: 'ROLE_REVIEWER', isAuthenticated: true },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={['/reviewer']}>
        <Routes>
          <Route
            path="/reviewer"
            element={
              <ProtectedRoute>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/reviewer/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });
});
