import React, { ReactNode } from 'react';
import { Header } from './Header';

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
      {/* Accessible skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-trust focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-focus"
      >
        Skip to main content
      </a>

      <Header />

      <main id="main-content" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-surface border-t border-border mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div>
            <span className="font-semibold text-ink-deep">CivicResolve AI</span> — Human-in-the-loop Consumer Grievance Triage System.
          </div>
          <div className="flex items-center gap-4">
            <span>RFC 9457 Compliant</span>
            <span>•</span>
            <span>Strict In-Memory Auth</span>
            <span>•</span>
            <span>Spring Boot REST</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

