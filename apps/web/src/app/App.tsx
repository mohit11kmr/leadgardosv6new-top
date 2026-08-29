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
import { ExpressFixCheckoutView } from '../features/billing/ExpressFixCheckoutView.js';
import { AgencyDashboardView } from '../features/agency/AgencyDashboardView.js';
import { ClientListView, ClientDetailView } from '../features/agency/ClientViews.js';
import { ProspectCampaignsView, ProspectDetailView } from '../features/agency/ProspectViews.js';
import { WidgetsView } from '../features/agency/WidgetViews.js';
import { CompetitorRadarView } from '../features/agency/CompetitorViews.js';
import { ReportListView } from '../features/reports/ReportListView.js';
import { ReportDetailView } from '../features/reports/ReportDetailView.js';
import { PublicReportView } from '../features/reports/PublicReportView.js';
import { DeveloperDashboardView } from '../features/developer/DeveloperDashboardView.js';
import { ApiKeysView } from '../features/developer/ApiKeysView.js';
import { WebhooksView } from '../features/developer/WebhooksView.js';
import { AdminDashboardView } from '../features/admin/AdminDashboardView.js';
import { AdminUsersView } from '../features/admin/AdminUsersView.js';
import { AdminOrgsView } from '../features/admin/AdminOrgsView.js';
import { AdminAuditLogsView } from '../features/admin/AdminAuditLogsView.js';
import { SettingsView } from '../features/settings/SettingsView.js';
import { NotificationSettingsView } from '../features/settings/NotificationSettingsView.js';
import { SecuritySettingsView } from '../features/settings/SecuritySettingsView.js';
import { TestimonialsView } from '../features/testimonials/TestimonialsView.js';

import {
  PrivacyPolicyView,
  TermsOfServiceView,
  CookiePolicyView,
  RefundPolicyView,
} from '../features/legal/LegalViews.js';
import { LandingPageView } from '../features/landing/LandingPageView.js';
import { ScanResultView } from '../features/scan/ScanResultView.js';

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
        {/* Public Legal & Policy Pages */}
        <Route path="/privacy" element={<PrivacyPolicyView />} />
        <Route path="/terms" element={<TermsOfServiceView />} />
        <Route path="/cookies" element={<CookiePolicyView />} />
        <Route path="/refund" element={<RefundPolicyView />} />

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

        {/* Public Share Links (Unauthenticated) */}
        <Route path="/public/reports/:token" element={<PublicReportView />} />
        <Route path="/scan/:scanId" element={<ScanResultView />} />

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
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportListView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports/:id"
          element={
            <ProtectedRoute>
              <ReportDetailView />
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
          path="/developer"
          element={
            <ProtectedRoute>
              <DeveloperDashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/developer/api-keys"
          element={
            <ProtectedRoute>
              <ApiKeysView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/developer/webhooks"
          element={
            <ProtectedRoute>
              <WebhooksView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboardView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute>
              <AdminUsersView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/organizations"
          element={
            <ProtectedRoute>
              <AdminOrgsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute>
              <AdminAuditLogsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/profile"
          element={
            <ProtectedRoute>
              <SettingsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/notifications"
          element={
            <ProtectedRoute>
              <NotificationSettingsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/security"
          element={
            <ProtectedRoute>
              <SecuritySettingsView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/testimonials"
          element={
            <ProtectedRoute>
              <TestimonialsView />
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
        <Route path="/checkout/express-fix" element={<ExpressFixCheckoutView />} />
        <Route
          path="/security/sessions"
          element={
            <ProtectedRoute>
              <SessionsView />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<LandingPageView />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
