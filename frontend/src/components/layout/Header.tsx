import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, UserCheck, Lock } from 'lucide-react';
import { useAuth } from '../../app/providers/AuthProvider';
import { Badge } from '../ui/Badge';

export const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-3 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded-lg"
          aria-label="CivicResolve AI Home"
        >
          <div
            className="w-9 h-9 rounded-lg bg-ink-deep flex items-center justify-center text-teal-trust shadow-sm group-hover:bg-ink-deep/90 transition-colors"
            aria-hidden="true"
          >
            <ShieldCheck size={20} className="text-[#2DD4BF]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink-deep tracking-tight text-base font-sans">
                CivicResolve AI
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-canvas border border-border px-1.5 py-0.5 rounded text-ink-muted">
                v0.1.0-alpha
              </span>
            </div>
            <p className="text-[11px] text-ink-muted hidden sm:block">
              Consumer Finance Complaint Triage & Decision Support
            </p>
          </div>
        </Link>

        {/* Public Navigation */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
          <Link
            to="/submit"
            className="text-xs font-semibold text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
          >
            Submit Complaint
          </Link>
          <Link
            to="/track"
            className="text-xs font-semibold text-ink-muted hover:text-teal-trust transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
          >
            Track Complaint
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/reviewer"
                className="hover:opacity-90 transition-opacity"
                title="Go to Reviewer Workspace"
              >
                <Badge variant="success" icon={<UserCheck size={12} />}>
                  Reviewer: {user.username}
                </Badge>
              </Link>
              <button
                type="button"
                onClick={logout}
                className="text-xs font-medium text-ink-muted hover:text-ink-deep underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="default" icon={<Lock size={12} />}>
                Unauthenticated
              </Badge>
              <Link
                to="/reviewer/login"
                className="text-xs font-semibold text-teal-trust hover:text-teal-trust-hover underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded"
              >
                Reviewer Sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

