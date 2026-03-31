import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageTracker } from './components/analytics/PageTracker';
import { DashboardLayout } from './components/layouts/DashboardLayout';
import { OverviewPage } from './modules/dashboard/pages/OverviewPage';
import { useAuthStore } from './modules/auth/auth.store';
import { isEnabled } from './lib/flags';
import { LoginPage } from './modules/auth/pages/LoginPage';
import { RegisterPage } from './modules/auth/pages/RegisterPage';
import { BillingCancelPage } from './modules/billing/pages/BillingCancelPage';
import { BillingPage } from './modules/billing/pages/BillingPage';
import { BillingSuccessPage } from './modules/billing/pages/BillingSuccessPage';
import { LandingPage } from './modules/landing/pages/LandingPage';
import { AnalyticsPage } from './modules/analytics/pages/AnalyticsPage';
import { ApiPage } from './modules/api/pages/ApiPage';
import { DatabasePage } from './modules/database/pages/DatabasePage';
import { ProjectsPage } from './modules/projects/pages/ProjectsPage';
import { StoragePage } from './modules/storage/pages/StoragePage';

function getAuthenticatedHomePath() {
  return isEnabled('newDashboard') ? '/overview' : '/projects';
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function HomeRoute() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to={getAuthenticatedHomePath()} replace />;
  }

  if (isEnabled('launchLandingPage')) {
    return <LandingPage />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/overview" element={isEnabled('newDashboard') ? <OverviewPage /> : <Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/database" element={<DatabasePage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/api" element={<ApiPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/billing/success" element={<BillingSuccessPage />} />
          <Route path="/billing/cancel" element={<BillingCancelPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
