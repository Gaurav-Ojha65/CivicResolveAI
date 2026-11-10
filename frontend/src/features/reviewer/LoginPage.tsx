import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ShieldCheck, Lock, User, KeyRound, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { AppLayout } from '../../components/layout/AppLayout';
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
          setErrorMessage('Access forbidden: Your account does not hold the required ROLE_REVIEWER authority.');
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
    <AppLayout>
      <div className="max-w-md mx-auto py-12 sm:py-16 px-4 sm:px-0">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-900 text-teal-400 mb-4 border border-slate-800 shadow-md">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-deep font-sans">
            Reviewer Portal Sign In
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-ink-muted">
            Authorized access for human triage and complaint adjudication.
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-6 sm:p-8 border border-border shadow-card">
          <div className="pb-5 mb-5 border-b border-border">
            <h2 className="text-base font-bold text-ink-deep">Staff Authentication</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Enter your credentials to access the complaint triage queue.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5">
              <Alert variant="danger" title="Authentication Error">
                {errorMessage}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="text-xs font-bold text-ink-deep">
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
              <Label htmlFor="password" className="text-xs font-bold text-ink-deep">
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
                Sign In to Workspace
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-border flex items-start gap-3 text-xs text-ink-muted bg-canvas p-4 rounded-xl border border-border/80">
            <KeyRound size={16} className="text-teal-trust flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-ink-deep">Strict In-Memory Session:</span>{' '}
              Credentials are never stored in browser storage (localStorage, sessionStorage, or cookies) and will be cleared immediately upon sign out or tab close.
            </div>
          </div>

          <div className="mt-5 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
            >
              <ArrowLeft size={13} />
              Return to Public Citizen Portal
            </Link>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
