import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';

export interface ProtectedRouteProps {
  children: React.ReactElement;
}

/**
 * Route guard that requires active in-memory reviewer authentication.
 * Unauthenticated users are redirected to /reviewer/login with their target location preserved.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/reviewer/login" state={{ from: location }} replace />;
  }

  return children;
};
