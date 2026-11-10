import { createBrowserRouter } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SubmitGrievancePage } from '../features/grievances/SubmitGrievancePage';
import { TrackGrievancePage } from '../features/tracking/TrackGrievancePage';
import { LoginPage } from '../features/reviewer/LoginPage';
import { ReviewerDashboardPage } from '../features/reviewer/ReviewerDashboardPage';
import { ReviewerGrievanceDetailPage } from '../features/reviewer/ReviewerGrievanceDetailPage';
import { ModelAuditPage } from '../features/reviewer/ModelAuditPage';
import { ExecutiveAnalyticsPage } from '../features/reviewer/ExecutiveAnalyticsPage';
import { ProtectedRoute } from '../features/reviewer/ProtectedRoute';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { PublicLayout } from '../components/layout/PublicLayout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ErrorBoundary>
        <PublicLayout>
          <LandingPage />
        </PublicLayout>
      </ErrorBoundary>
    ),
  },
  {
    path: '/submit',
    element: (
      <ErrorBoundary>
        <PublicLayout>
          <SubmitGrievancePage />
        </PublicLayout>
      </ErrorBoundary>
    ),
  },
  {
    path: '/track',
    element: (
      <ErrorBoundary>
        <PublicLayout>
          <TrackGrievancePage />
        </PublicLayout>
      </ErrorBoundary>
    ),
  },
  {
    path: '/reviewer/login',
    element: (
      <ErrorBoundary>
        <LoginPage />
      </ErrorBoundary>
    ),
  },
  {
    path: '/reviewer',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ReviewerDashboardPage />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
  },
  {
    path: '/reviewer/grievances/:id',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ReviewerGrievanceDetailPage />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
  },
  {
    path: '/reviewer/audit',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ModelAuditPage />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
  },
  {
    path: '/reviewer/analytics',
    element: (
      <ErrorBoundary>
        <ProtectedRoute>
          <ExecutiveAnalyticsPage />
        </ProtectedRoute>
      </ErrorBoundary>
    ),
  },
  {
    path: '*',
    element: (
      <ErrorBoundary>
        <NotFoundPage />
      </ErrorBoundary>
    ),
  },
]);
