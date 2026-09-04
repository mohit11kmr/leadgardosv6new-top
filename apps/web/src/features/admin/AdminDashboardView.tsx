import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';

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
  const { hasPlatformCapability } = useAuth();
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => api<AdminMetrics>('/admin/metrics'),
    enabled: hasPlatformCapability('PLATFORM_VIEW'),
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

      {hasPlatformCapability('PLATFORM_VIEW') && isLoading && <div className="card">Loading platform metrics...</div>}
      {hasPlatformCapability('PLATFORM_VIEW') && error && <div className="card errorBanner">{(error as Error).message}</div>}

      {metrics && (
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
      )}

      {/* Nav cards render independent of the metrics query above (which
          requires PLATFORM_VIEW) so a user with only e.g. FINANCE_VIEW
          still sees the surfaces they actually have access to. */}
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

        {hasPlatformCapability('CUSTOMER_VIEW') && (
          <div className="card p4">
            <h3 className="fontBold textLg mb2 textPrimary">🏢 Organization Moderation</h3>
            <p className="textSecondary textSm mb4">
              View active tenants, commercial tier entitlements, and suspend policy violations.
            </p>
            <Link to="/admin/organizations" className="btn btn-primary btn-sm">
              Manage Organizations →
            </Link>
          </div>
        )}

        {hasPlatformCapability('AUDIT_LOG_VIEW') && (
          <div className="card p4">
            <h3 className="fontBold textLg mb2 textPrimary">📜 Admin Audit Trail</h3>
            <p className="textSecondary textSm mb4">
              Explore immutable administrative logs, role modifications, and moderation events.
            </p>
            <Link to="/admin/audit" className="btn btn-primary btn-sm">
              Inspect Logs →
            </Link>
          </div>
        )}

        {hasPlatformCapability('FINANCE_VIEW') && (
          <div className="card p4">
            <h3 className="fontBold textLg mb2 textPrimary">💰 Revenue</h3>
            <p className="textSecondary textSm mb4">MRR/ARR, period revenue movement, and refunds.</p>
            <Link to="/admin/revenue" className="btn btn-primary btn-sm">
              Open Revenue Dashboard →
            </Link>
          </div>
        )}

        {hasPlatformCapability('OPERATIONS_VIEW') && (
          <div className="card p4">
            <h3 className="fontBold textLg mb2 textPrimary">⚙️ Operations</h3>
            <p className="textSecondary textSm mb4">Queue health across every real background job queue.</p>
            <Link to="/admin/operations" className="btn btn-primary btn-sm">
              Open Operations →
            </Link>
          </div>
        )}

        {hasPlatformCapability('SECURITY_VIEW') && (
          <div className="card p4">
            <h3 className="fontBold textLg mb2 textPrimary">🛡️ Security Events</h3>
            <p className="textSecondary textSm mb4">Auth, billing-fraud, and abuse signals across the platform.</p>
            <Link to="/admin/security" className="btn btn-primary btn-sm">
              Open Security Events →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
