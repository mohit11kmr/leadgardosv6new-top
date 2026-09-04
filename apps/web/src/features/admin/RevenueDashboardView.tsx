import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

interface MoneyAmount {
  amountInPaise: number;
}
interface UnsupportedMetric {
  status: 'UNSUPPORTED';
  reason: string;
}
interface RevenueSummary {
  currency: 'INR';
  asOf: string;
  period: { label: string; start: string; end: string };
  currentMrr: MoneyAmount & { organizationCount: number };
  currentArr: MoneyAmount;
  newMrr: MoneyAmount & { subscriptionCount: number; semantics: string };
  churnedMrr: MoneyAmount & { subscriptionCount: number; semantics: string };
  expansionMrr: UnsupportedMetric;
  contractionMrr: UnsupportedMetric;
  collectedRevenue: MoneyAmount & { paymentCount: number };
  failedPaymentAmount: MoneyAmount & { paymentCount: number };
  revenueByPlan: Array<{ planCode: string; planName: string; amountInPaise: number; paymentCount: number }>;
}

function rupees(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
}

export function RevenueDashboardView() {
  const [period, setPeriod] = useState<'today' | 'current_month' | 'previous_month'>('current_month');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-revenue-summary', period],
    queryFn: () => api<RevenueSummary>(`/admin/revenue/summary?period=${period}`),
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Revenue</span>
          </div>
          <h1 className="viewTitle">Revenue Dashboard</h1>
          <p className="viewSubtitle">
            MRR/ARR and period revenue movement — every figure below is a real-time aggregation, never a fixture.
          </p>
        </div>
        <div className="flex gap-2">
          {(['today', 'current_month', 'previous_month'] as const).map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${period === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPeriod(p)}
            >
              {p.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <div className="loadingState">Loading revenue summary...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {data && (
        <>
          <p className="text-muted text-xs mb-4">
            As of {new Date(data.asOf).toLocaleString()} · Period: {data.period.label}
          </p>

          <div className="grid3">
            <div className="metricCard card highlight">
              <div className="metricLabel">Current MRR</div>
              <div className="metricValue">{rupees(data.currentMrr.amountInPaise)}</div>
              <div className="metricSubtext">{data.currentMrr.organizationCount} active subscriptions — recurring revenue capacity</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Current ARR</div>
              <div className="metricValue">{rupees(data.currentArr.amountInPaise)}</div>
              <div className="metricSubtext">MRR × 12</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Collected Revenue ({data.period.label})</div>
              <div className="metricValue">{rupees(data.collectedRevenue.amountInPaise)}</div>
              <div className="metricSubtext">{data.collectedRevenue.paymentCount} captured payments — gross, not netted against refunds</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">New MRR</div>
              <div className="metricValue">{rupees(data.newMrr.amountInPaise)}</div>
              <div className="metricSubtext">{data.newMrr.subscriptionCount} new subscription(s) started this period</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Churned MRR</div>
              <div className="metricValue">{rupees(data.churnedMrr.amountInPaise)}</div>
              <div className="metricSubtext">{data.churnedMrr.subscriptionCount} subscription(s) cancelled/expired this period</div>
            </div>
            <div className="metricCard card">
              <div className="metricLabel">Failed Payment Amount</div>
              <div className="metricValue">{rupees(data.failedPaymentAmount.amountInPaise)}</div>
              <div className="metricSubtext">{data.failedPaymentAmount.paymentCount} failed payment(s) — so what: possible collection risk</div>
            </div>
          </div>

          <div className="grid2 mt6">
            <div className="card p4">
              <h3 className="fontBold textLg mb2">Expansion MRR</h3>
              <span className="badge badge-neutral">Unsupported</span>
              <p className="textSecondary textSm mt2">{data.expansionMrr.reason}</p>
            </div>
            <div className="card p4">
              <h3 className="fontBold textLg mb2">Contraction MRR</h3>
              <span className="badge badge-neutral">Unsupported</span>
              <p className="textSecondary textSm mt2">{data.contractionMrr.reason}</p>
            </div>
          </div>

          {data.revenueByPlan.length > 0 && (
            <div className="tableCard mt6">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Revenue ({data.period.label})</th>
                    <th>Payments</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenueByPlan.map((p) => (
                    <tr key={p.planCode}>
                      <td>{p.planName}</td>
                      <td>{rupees(p.amountInPaise)}</td>
                      <td>{p.paymentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
