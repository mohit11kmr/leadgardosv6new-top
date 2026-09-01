import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

export interface AdminAuditLogItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
}

export function AdminAuditLogsView() {
  const [resourceType, setResourceType] = useState<string>('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-audit-logs', resourceType],
    queryFn: () =>
      api<{ items: AdminAuditLogItem[]; nextCursor: string | null; hasMore: boolean }>(
        `/admin/audit-logs${resourceType ? `?resourceType=${resourceType}` : ''}`
      ),
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/admin">Admin</Link> / <span>Audit Logs</span>
          </div>
          <h1 className="viewTitle">Administrative Audit Trail</h1>
          <p className="viewSubtitle">
            Immutable log of all administrative actions, permission overrides, and security alterations.
          </p>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <select
          className="formSelect max-w-xs"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
        >
          <option value="">All Resource Types</option>
          <option value="USER">Users</option>
          <option value="ORGANIZATION">Organizations</option>
          <option value="BILLING">Billing & Subscriptions</option>
          <option value="SECURITY">Security Events</option>
        </select>
      </div>

      {isLoading && <div className="loadingState">Loading audit trail...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Action</th>
                <th>Target Resource</th>
                <th>Admin Actor</th>
                <th>IP Address</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {data?.items && data.items.length > 0 ? (
                data.items.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span className="badge badge-neutral">{log.action}</span>
                    </td>
                    <td>
                      <strong>{log.resourceType}</strong>{' '}
                      {log.resourceId && <span className="text-muted text-xs font-mono">({log.resourceId.slice(0, 8)}...)</span>}
                    </td>
                    <td>{log.user ? `${log.user.name || log.user.email}` : 'System Engine'}</td>
                    <td>
                      <code className="text-xs">{log.ipAddress || '127.0.0.1'}</code>
                    </td>
                    <td>{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-muted p-4">
                    No administrative audit events found.
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
