import { useEffect, useRef } from 'react';
import { createBrowserRouter, Outlet, useLocation, useMatches, useNavigation } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProtectedRoute } from '../features/reviewer/ProtectedRoute';
import { ErrorBoundary } from '../components/layout/ErrorBoundary';
import { PublicLayout } from '../components/layout/PublicLayout';
import { CivicAssist } from '../features/assistant/CivicAssist';

export function RouteFrame() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const page = matches[matches.length - 1]?.handle as { title: string } | undefined;
  const title = page?.title ?? 'Financial complaints';
  const navigation = useNavigation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    document.title = title + ' | CivicResolve AI';
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [pathname, title]);

  return <>
    <ErrorBoundary key={pathname}>
      {navigation.state === 'loading' && <p role="status" className="sr-only">Loading page…</p>}
      <Outlet />
    </ErrorBoundary>
    <ErrorBoundary fallback={<span className="sr-only">Assistant unavailable</span>}>
      <CivicAssist />
    </ErrorBoundary>
  </>;
}

export const router = createBrowserRouter([{
  element: <RouteFrame />,
  children: [
    {
      element: <PublicLayout><Outlet /></PublicLayout>,
      children: [
        { index: true, element: <LandingPage />, handle: { title: 'Financial complaints' } },
        { path: 'submit', handle: { title: 'Submit a complaint' }, lazy: async () => ({ Component: (await import('../features/grievances/SubmitGrievancePage')).SubmitGrievancePage }) },
        { path: 'track', handle: { title: 'Track a complaint' }, lazy: async () => ({ Component: (await import('../features/tracking/TrackGrievancePage')).TrackGrievancePage }) },
        { path: '*', element: <NotFoundPage />, handle: { title: 'Page not found' } },
      ],
    },
    { path: 'reviewer/login', handle: { title: 'Reviewer sign in' }, lazy: async () => ({ Component: (await import('../features/reviewer/LoginPage')).LoginPage }) },
    {
      path: 'reviewer',
      element: <ProtectedRoute><Outlet /></ProtectedRoute>,
      children: [
        { index: true, handle: { title: 'Complaint queue' }, lazy: async () => ({ Component: (await import('../features/reviewer/ReviewerDashboardPage')).ReviewerDashboardPage }) },
        { path: 'grievances/:id', handle: { title: 'Case review' }, lazy: async () => ({ Component: (await import('../features/reviewer/ReviewerGrievanceDetailPage')).ReviewerGrievanceDetailPage }) },
        { path: 'analytics', handle: { title: 'Executive analytics' }, lazy: async () => ({ Component: (await import('../features/reviewer/ExecutiveAnalyticsPage')).ExecutiveAnalyticsPage }) },
        { path: 'audit', handle: { title: 'Model audit' }, lazy: async () => ({ Component: (await import('../features/reviewer/ModelAuditPage')).ModelAuditPage }) },
      ],
    },
  ],
}]);
