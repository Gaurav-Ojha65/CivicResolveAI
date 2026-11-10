import React from 'react';

interface PublicLayoutProps {
  children: React.ReactNode;
}

/**
 * Minimal wrapper for public-facing pages (landing, submit).
 * Does not include the reviewer Header component.
 * Navigation and footer are embedded in each public page.
 * Provides the shared min-h-screen wrapper and an accessibility skip link.
 */
export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-canvas font-sans antialiased">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-teal-trust focus:text-white focus:rounded-md focus:shadow-lg"
      >
        Skip to main content
      </a>
      {children}
    </div>
  );
};
