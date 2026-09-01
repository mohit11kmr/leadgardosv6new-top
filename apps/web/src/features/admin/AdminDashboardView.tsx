import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

export interface AdminMetrics {
  totalUsers: number;
  totalOrganizations: number;
  totalWebsites: number;
  totalAudits: number;
  totalMonitoringRuns: number;
  totalActiveSubscriptions: number;
  totalRevenueRupees: number;
  failedAudits: number;
  securityEventsCount: number;
  systemHealth: string;
}

export function AdminDashboardView() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api<AdminMetrics>('/admin/metrics'),
  });

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>LeadGuard OS — System Administration</h1>
          <p>
            Real-time platform telemetry, user security controls, organization billing management, and audit trails.
          </p>
        </div>
        <div className="headerActions">
          <span
            className={`badge ${
              metrics?.systemHealth === 'OPTIMAL' ? 'badge-success' : 'badge-warning'
            }`}
          >
            System Status: {metrics?.systemHealth || 'OPTIMAL'}
          </span>
        </div>
      </div>

      {isLoading && <div className="card">Loading platform metrics...</div>}
      {error && <div className="card errorBanner">{(error as Error).message}</div>}

      {metrics && (
        <>
          <div className="grid3">
            <div className="metricCard card highlight">
              <div className="metricLabel">Total Users</div>
              <div className="metricValue">{metrics.totalUsers}</div>
              <div className="metricSubtext">Registered accounts</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Organizations</div>
              <div className="metricValue">{metrics.totalOrganizations}</div>
              <div className="metricSubtext">Workspaces & Teams</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Active Subscriptions</div>
              <div className="metricValue">{metrics.totalActiveSubscriptions}</div>
              <div className="metricSubtext">Commercial plans</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Captured Revenue</div>
              <div className="metricValue">₹{metrics.totalRevenueRupees.toLocaleString()}</div>
              <div className="metricSubtext">Platform total</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Audits Performed</div>
              <div className="metricValue">{metrics.totalAudits}</div>
              <div className="metricSubtext">Failed: {metrics.failedAudits}</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Watchdog Runs</div>
              <div className="metricValue">{metrics.totalMonitoringRuns}</div>
              <div className="metricSubtext">24/7 continuous health</div>
            </div>
          </div>

          <div className="grid3 mt6">
            <div className="card p4">
              <h3 className="fontBold textLg mb2 textPrimary">👤 User Management</h3>
              <p className="textSecondary textSm mb4">
                Inspect registered users, disable rogue accounts, and terminate compromised sessions.
              </p>
              <Link to="/admin/users" className="btn btn-primary btn-sm">
                Manage Users →
              </Link>
            </div>

            <div className="card p4">
              <h3 className="fontBold textLg mb2 textPrimary">🏢 Organization Moderation</h3>
              <p className="textSecondary textSm mb4">
                View active tenants, commercial tier entitlements, and suspend policy violations.
              </p>
              <Link to="/admin/organizations" className="btn btn-primary btn-sm">
                Manage Organizations →
              </Link>
            </div>

            <div className="card p4">
              <h3 className="fontBold textLg mb2 textPrimary">📜 Admin Audit Trail</h3>
              <p className="textSecondary textSm mb4">
                Explore immutable administrative logs, role modifications, and moderation events.
              </p>
              <Link to="/admin/audit" className="btn btn-primary btn-sm">
                Inspect Logs →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
