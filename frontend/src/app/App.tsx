import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { AuthProvider } from './providers/AuthProvider';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <RouterProvider router={router} fallbackElement={<p role="status" className="p-6 text-ink-muted">Loading page…</p>} />
    </AuthProvider>
  );
};

