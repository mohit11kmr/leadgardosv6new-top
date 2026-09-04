import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

interface CustomerDetail {
  organization: { id: string; name: string; slug: string; isSuspended: boolean; suspendedReason: string | null; createdAt: string };
  users: { count: number; members: Array<{ userId: string; role: string; email: string; isDisabled: boolean }> };
  subscription: {
    status: string;
    plan: string;
    planName: string;
    priceInPaise: number;
    billingInterval: string;
    currentPeriodEnd: string | null;
  } | null;
  revenue: {
    period: string;
    currentMrr: { amountInPaise: number };
    currentArr: { amountInPaise: number };
    collectedRevenue: { amountInPaise: number; paymentCount: number };
    failedPaymentAmount: { amountInPaise: number; paymentCount: number };
    recentRefunds: Array<{ id: string; amountInPaise: number; status: string; reason: string; createdAt: string }>;
  };
  productUsage: { websites: number; audits: number; activeMonitoringConfigs: number; openFindings: number; reports: number };
  businessImpactTrend: {
    status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
    summary: string;
    estimatedRiskFirst: number | null;
    estimatedRiskLatest: number | null;
    findingsResolved: number | null;
    findingsIntroduced: number | null;
    disclaimer: string;
  };
  health: {
    score: number;
    band: 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';
    provisional: boolean;
    reasons: string[];
  };
  agency: { clientWorkspaces: number; prospects: number; pitches: number } | null;
  security: { status?: 'RESTRICTED'; reason?: string; totalEventCount?: number; recentEvents?: Array<{ id: string; type: string; createdAt: string; ipAddress: string | null }> };
  activity: {
    recentFunnelEvents: Array<{ id: string; type: string; createdAt: string }>;
    recentAdminActions: Array<{ id: string; action: string; createdAt: string }>;
  };
}

function rupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

const HEALTH_BADGE: Record<string, string> = {
  HEALTHY: 'badge-success',
  NEEDS_ATTENTION: 'badge-warning',
  AT_RISK: 'badge-error',
};

export function CustomerDetailView() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-customer-360', id],
    queryFn: () => api<CustomerDetail>(`/admin/organizations/${id}`),
    enabled: Boolean(id),
  });

  const toggleSuspendMutation = useMutation({
    mutationFn: (suspended: boolean) =>
      api(`/admin/organizations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ suspended }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-customer-360', id] }),
    onError: (err: unknown) => setMutationError(err instanceof Error ? err.message : 'Failed to update organization status'),
  });

  if (isLoading) return <div className="viewContainer loadingState">Loading customer 360...</div>;
  if (error) return <div className="viewContainer errorBanner">{(error as Error).message}</div>;
  if (!data) return null;

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <Link to="/admin/organizations">Organizations</Link> /{' '}
            <span>{data.organization.name}</span>
          </div>
          <h1 className="viewTitle">{data.organization.name}</h1>
          <p className="viewSubtitle">
            {data.organization.slug} · Created {new Date(data.organization.createdAt).toLocaleDateString()} ·{' '}
            <span className={`badge ${data.organization.isSuspended ? 'badge-error' : 'badge-success'}`}>
              {data.organization.isSuspended ? 'Suspended' : 'Active'}
            </span>{' '}
            · <span className={`badge ${HEALTH_BADGE[data.health.band]}`}>{data.health.band}{data.health.provisional ? ' (provisional)' : ''}</span>
          </p>
        </div>
        <button
          className={`btn btn-sm ${data.organization.isSuspended ? 'btn-primary' : 'btn-danger'}`}
          onClick={() => toggleSuspendMutation.mutate(!data.organization.isSuspended)}
          disabled={toggleSuspendMutation.isPending}
        >
          {data.organization.isSuspended ? 'Restore Access' : 'Suspend'}
        </button>
      </div>
      {mutationError && <div className="errorBanner">{mutationError}</div>}

      {/* Health */}
      <div className="card p4">
        <h3 className="fontBold textLg mb2">Customer Health — {data.health.score}/100</h3>
        <ul className="textSecondary textSm">
          {data.health.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {/* Revenue */}
      <div className="grid4 mt6">
        <div className="metricCard card highlight">
          <div className="metricLabel">Current MRR</div>
          <div className="metricValue">{rupees(data.revenue.currentMrr.amountInPaise)}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Current ARR</div>
          <div className="metricValue">{rupees(data.revenue.currentArr.amountInPaise)}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Collected ({data.revenue.period})</div>
          <div className="metricValue">{rupees(data.revenue.collectedRevenue.amountInPaise)}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Failed Payments</div>
          <div className="metricValue">{rupees(data.revenue.failedPaymentAmount.amountInPaise)}</div>
        </div>
      </div>

      {data.subscription && (
        <p className="text-muted text-sm mt-2">
          Plan: {data.subscription.planName} ({data.subscription.status}) — renews{' '}
          {data.subscription.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString() : 'Not available'}
        </p>
      )}
      {!data.subscription && <p className="text-muted text-sm mt-2">No active subscription.</p>}

      {data.revenue.recentRefunds.length > 0 && (
        <div className="tableCard mt-4">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Refund</th>
                <th>Status</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.revenue.recentRefunds.map((r) => (
                <tr key={r.id}>
                  <td>{rupees(r.amountInPaise)}</td>
                  <td>{r.status}</td>
                  <td>{r.reason}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Product usage */}
      <div className="grid4 mt6">
        <div className="metricCard card">
          <div className="metricLabel">Websites</div>
          <div className="metricValue">{data.productUsage.websites}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Audits</div>
          <div className="metricValue">{data.productUsage.audits}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Active Monitoring</div>
          <div className="metricValue">{data.productUsage.activeMonitoringConfigs}</div>
        </div>
        <div className="metricCard card">
          <div className="metricLabel">Reports</div>
          <div className="metricValue">{data.productUsage.reports}</div>
        </div>
      </div>

      {/* Business impact trend */}
      <div className="card p4 mt6">
        <h3 className="fontBold textLg mb2">Business Impact Trend (30 days)</h3>
        {data.businessImpactTrend.status === 'AVAILABLE' ? (
          <>
            <p className="textSecondary textSm">{data.businessImpactTrend.summary}</p>
            <div className="grid3 mt-2">
              <div>
                <div className="metricLabel">Estimated Risk (first)</div>
                <div className="metricValue">{rupees(data.businessImpactTrend.estimatedRiskFirst!)}</div>
              </div>
              <div>
                <div className="metricLabel">Estimated Risk (latest)</div>
                <div className="metricValue">{rupees(data.businessImpactTrend.estimatedRiskLatest!)}</div>
              </div>
              <div>
                <div className="metricLabel">Findings Resolved / Introduced</div>
                <div className="metricValue">
                  {data.businessImpactTrend.findingsResolved} / {data.businessImpactTrend.findingsIntroduced}
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">Not available — {data.businessImpactTrend.summary}</p>
        )}
        <p className="text-muted text-xs mt-2">{data.businessImpactTrend.disclaimer}</p>
      </div>

      {/* Agency */}
      {data.agency && (
        <div className="card p4 mt6">
          <h3 className="fontBold textLg mb2">Agency Activity</h3>
          <p className="textSecondary textSm">
            {data.agency.clientWorkspaces} client workspace(s) · {data.agency.prospects} prospect(s) · {data.agency.pitches} pitch(es)
          </p>
        </div>
      )}

      {/* Security (capability-gated server-side) */}
      <div className="card p4 mt6">
        <h3 className="fontBold textLg mb2">Security Events</h3>
        {data.security.status === 'RESTRICTED' ? (
          <p className="text-muted text-sm">{data.security.reason}</p>
        ) : (
          <>
            <p className="textSecondary textSm mb2">{data.security.totalEventCount} total event(s).</p>
            <ul className="textSecondary textSm">
              {data.security.recentEvents?.map((e) => (
                <li key={e.id}>
                  {e.type} — {new Date(e.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Activity timeline */}
      <div className="card p4 mt6">
        <h3 className="fontBold textLg mb2">Recent Activity</h3>
        <ul className="textSecondary textSm">
          {data.activity.recentFunnelEvents.map((e) => (
            <li key={e.id}>
              {e.type} — {new Date(e.createdAt).toLocaleString()}
            </li>
          ))}
          {data.activity.recentAdminActions.map((a) => (
            <li key={a.id}>
              [admin] {a.action} — {new Date(a.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>

      {/* Users */}
      <div className="card p4 mt6">
        <h3 className="fontBold textLg mb2">Members ({data.users.count})</h3>
        <ul className="textSecondary textSm">
          {data.users.members.map((m) => (
            <li key={m.userId}>
              {m.email} — {m.role}
              {m.isDisabled ? ' (disabled)' : ''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
