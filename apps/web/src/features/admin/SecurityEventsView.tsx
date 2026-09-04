import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

interface SecurityEventItem {
  id: string;
  type: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH';
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
}

const SEVERITY_BADGE: Record<string, string> = {
  HIGH: 'badge-error',
  MEDIUM: 'badge-warning',
  LOW: 'badge-neutral',
  INFO: 'badge-success',
};

export function SecurityEventsView() {
  const [type, setType] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-security-events', type],
    queryFn: () => api<{ items: SecurityEventItem[]; nextCursor: string | null; hasMore: boolean }>(`/admin/security-events${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Security Events</span>
          </div>
          <h1 className="viewTitle">Security Events</h1>
          <p className="viewSubtitle">
            Authentication, billing-fraud, and abuse signals already recorded by the product — now visible to
            authorized operators. So what: a HIGH-severity event is worth investigating now, not archaeology later.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          className="formInput max-w-md"
          placeholder="Filter by event type (e.g. LOGIN_FAILURE)..."
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
      </div>

      {isLoading && <div className="loadingState">Loading security events...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {data && (
        <div className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>User</th>
                <th>IP</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.type}</td>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[e.severity] ?? 'badge-neutral'}`}>{e.severity}</span>
                  </td>
                  <td>{e.userEmail ?? '—'}</td>
                  <td className="font-mono text-xs">{e.ipAddress ?? '—'}</td>
                  <td>{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
              {data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center">
                    No security events match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
