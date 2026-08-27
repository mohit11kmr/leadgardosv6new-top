import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

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
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">LeadGuard OS — System Administration</h1>
          <p className="viewSubtitle">
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

      {isLoading && <div className="loadingState">Loading platform metrics...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {metrics && (
        <>
          <div className="statsGrid">
            <div className="statCard primary">
              <div className="statLabel">Total Users</div>
              <div className="statValue">{metrics.totalUsers}</div>
              <div className="statSub">Registered accounts</div>
            </div>
            <div className="statCard">
              <div className="statLabel">Organizations</div>
              <div className="statValue">{metrics.totalOrganizations}</div>
              <div className="statSub">Workspaces & Teams</div>
            </div>
            <div className="statCard">
              <div className="statLabel">Active Subscriptions</div>
              <div className="statValue">{metrics.totalActiveSubscriptions}</div>
              <div className="statSub">Commercial plans</div>
            </div>
            <div className="statCard">
              <div className="statLabel">Captured Revenue</div>
              <div className="statValue">₹{metrics.totalRevenueRupees.toLocaleString()}</div>
              <div className="statSub">Platform total</div>
            </div>
            <div className="statCard">
              <div className="statLabel">Audits Performed</div>
              <div className="statValue">{metrics.totalAudits}</div>
              <div className="statSub">Failed: {metrics.failedAudits}</div>
            </div>
            <div className="statCard">
              <div className="statLabel">Watchdog Runs</div>
              <div className="statValue">{metrics.totalMonitoringRuns}</div>
              <div className="statSub">24/7 continuous health</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="card p-4">
              <h3 className="font-bold text-lg mb-2">👤 User Management</h3>
              <p className="text-muted text-sm mb-4">
                Inspect registered users, disable rogue accounts, and terminate compromised sessions.
              </p>
              <Link to="/admin/users" className="btn btn-primary btn-sm">
                Manage Users →
              </Link>
            </div>

            <div className="card p-4">
              <h3 className="font-bold text-lg mb-2">🏢 Organization Moderation</h3>
              <p className="text-muted text-sm mb-4">
                View active tenants, commercial tier entitlements, and suspend policy violations.
              </p>
              <Link to="/admin/organizations" className="btn btn-primary btn-sm">
                Manage Organizations →
              </Link>
            </div>

            <div className="card p-4">
              <h3 className="font-bold text-lg mb-2">📜 Admin Audit Trail</h3>
              <p className="text-muted text-sm mb-4">
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
