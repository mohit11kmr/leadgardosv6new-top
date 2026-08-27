import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { Shell } from '../components/layout/Shell.js';
import { LoginView, RegisterView } from '../features/auth/AuthViews.js';
import { DashboardView } from '../features/dashboard/DashboardView.js';
import { WebsiteListView, WebsiteDetailView } from '../features/websites/WebsiteViews.js';
import { AuditListView } from '../features/audits/AuditListView.js';
import { AuditDetailView } from '../features/audits/AuditDetailView.js';

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
        <Route path="/" element={<Navigate to={authenticated ? '/dashboard' : '/login'} replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
