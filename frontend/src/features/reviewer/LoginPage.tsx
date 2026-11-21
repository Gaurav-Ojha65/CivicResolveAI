import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShieldCheck, Lock, User, KeyRound } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { PublicLayout } from '../../components/layout/PublicLayout';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ApiError } from '../../lib/errors/api-error';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Determine redirection target if redirected by ProtectedRoute
  const fromLocation = (location.state as { from?: Location })?.from?.pathname || '/reviewer';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(fromLocation, { replace: true });
    }
  }, [isAuthenticated, navigate, fromLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMessage('Please enter your reviewer username.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      await login(cleanUsername, password);
      navigate(fromLocation, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setErrorMessage('Invalid username or password. Please verify your reviewer credentials.');
        } else if (err.status === 403) {
          setErrorMessage('This account does not have reviewer access.');
        } else {
          setErrorMessage(err.message || 'Authentication failed. Please check backend availability.');
        }
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred during authentication.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicLayout>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-lg px-5 py-10 sm:py-16">
        <div className="mb-6">
          <ShieldCheck size={28} aria-hidden="true" className="mb-4 text-teal-trust" />
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Reviewer sign in</h1>
          <p className="mt-2 text-base text-ink-muted">Use your staff credentials to open the complaint queue.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-8">
          {errorMessage && (
            <div className="mb-5">
              <Alert variant="danger" title="Sign-in failed">
                {errorMessage}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-sm font-semibold text-ink-deep">
                Username
              </Label>
              <div className="mt-1">
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. reviewer"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  leftIcon={<User size={16} />}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-semibold text-ink-deep">
                Password
              </Label>
              <div className="mt-1">
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  leftIcon={<Lock size={16} />}
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full shadow-xs font-bold justify-center"
                isLoading={isLoading}
                disabled={isLoading}
              >
                Sign in to workspace
              </Button>
            </div>
          </form>

          <div className="mt-6 flex items-start gap-3 border-t border-line pt-5 text-sm text-ink-muted">
            <KeyRound size={17} className="mt-0.5 shrink-0 text-teal-trust" aria-hidden="true" />
            <p>Your session stays in this tab’s memory. Refreshing the page, closing the tab or signing out clears it.</p>
          </div>
        </div>
      </main>
    </PublicLayout>
  );
};
