import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Shell } from '../components/layout/Shell.js';
import { LoginView, RegisterView } from '../features/auth/AuthViews.js';
import {
  PasswordResetRequestView,
  PasswordResetConfirmView,
} from '../features/auth/PasswordResetViews.js';
import { SessionsView } from '../features/auth/SessionsView.js';
import { DashboardView } from '../features/dashboard/DashboardView.js';
import { WebsiteListView, WebsiteDetailView } from '../features/websites/WebsiteViews.js';
import { AuditListView } from '../features/audits/AuditListView.js';
import { AuditDetailView } from '../features/audits/AuditDetailView.js';
import { MonitoringView } from '../features/monitoring/MonitoringView.js';
import { MonitorDetailView } from '../features/monitoring/MonitorDetailView.js';
import { BillingView } from '../features/billing/BillingView.js';
import { AgencyDashboardView } from '../features/agency/AgencyDashboardView.js';
import { ClientListView, ClientDetailView } from '../features/agency/ClientViews.js';
import { ProspectCampaignsView, ProspectDetailView } from '../features/agency/ProspectViews.js';
import { WidgetsView } from '../features/agency/WidgetViews.js';
import { CompetitorRadarView } from '../features/agency/CompetitorViews.js';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authenticated } = useAuth();
  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Shell>{children}</Shell>;
}

export function App() {
  const { authenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            authenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginView onSwitchToRegister={() => { window.location.href = '/register'; }} />
            )
          }
        />
        <Route
          path="/register"
          element={
            authenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <RegisterView onSwitchToLogin={() => { window.location.href = '/login'; }} />
            )
          }
        />
        <Route path="/password-reset" element={<PasswordResetRequestView />} />
        <Route path="/password-reset/confirm" element={<PasswordResetConfirmView />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/websites"
          element={
            <ProtectedRoute>
              <WebsiteListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/websites/:id"
          element={
            <ProtectedRoute>
              <WebsiteDetailView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audits"
          element={
            <ProtectedRoute>
              <AuditListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audits/:id"
          element={
            <ProtectedRoute>
              <AuditDetailView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/monitoring"
          element={
            <ProtectedRoute>
              <MonitoringView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/monitoring/:id"
          element={
            <ProtectedRoute>
              <MonitorDetailView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency"
          element={
            <ProtectedRoute>
              <AgencyDashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/clients"
          element={
            <ProtectedRoute>
              <ClientListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/clients/:id"
          element={
            <ProtectedRoute>
              <ClientDetailView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/prospects"
          element={
            <ProtectedRoute>
              <ProspectCampaignsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/prospects/:id"
          element={
            <ProtectedRoute>
              <ProspectDetailView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/widgets"
          element={
            <ProtectedRoute>
              <WidgetsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agency/competitors"
          element={
            <ProtectedRoute>
              <CompetitorRadarView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/security/sessions"
          element={
            <ProtectedRoute>
              <SessionsView />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={authenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
