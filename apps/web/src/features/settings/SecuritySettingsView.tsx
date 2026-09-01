import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiClient as api } from '../../api/client.js';

export interface SessionItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function SecuritySettingsView() {
  const queryClient = useQueryClient();

  const { data: sessions, isLoading, error } = useQuery({
    queryKey: ['settings-sessions'],
    queryFn: () => api<SessionItem[]>('/settings/sessions'),
  });

  const [mutationError, setMutationError] = useState<string | null>(null);

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) => api(`/settings/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-sessions'] });
    },
    onError: (err: unknown) => setMutationError(err instanceof Error ? err.message : 'Failed to revoke session'),
  });

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Active Sessions & Account Security</h1>
          <p className="viewSubtitle">
            Review active login sessions, IP addresses, and revoke unrecognized devices.
          </p>
        </div>
      </div>

      {mutationError && <div className="errorBanner">{mutationError}</div>}

      <div className="grid grid-cols-4 gap-6">
        <aside className="col-span-1">
          <nav className="space-y-1">
            <Link to="/settings" className="sidebarLink">
              👤 Personal Profile
            </Link>
            <Link to="/settings/notifications" className="sidebarLink">
              🔔 Notifications
            </Link>
            <Link to="/settings/security" className="sidebarLink active">
              🛡️ Active Sessions & Security
            </Link>
            <Link to="/billing" className="sidebarLink">
              💳 Plans & Invoices
            </Link>
          </nav>
        </aside>

        <main className="col-span-3">
          {isLoading && <div className="loadingState">Loading active sessions...</div>}
          {error && <div className="errorBanner">{(error as Error).message}</div>}

          {sessions && (
            <div className="tableCard">
              <table className="dataTable">
                <thead>
                  <tr>
                    <th>Device / User Agent</th>
                    <th>IP Address</th>
                    <th>Session Started</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.userAgent || 'Unknown Device'}</strong>
                        {s.isCurrent && (
                          <span className="badge badge-success ml-2">Current Session</span>
                        )}
                      </td>
                      <td>
                        <code className="text-xs">{s.ipAddress || '127.0.0.1'}</code>
                      </td>
                      <td>{new Date(s.createdAt).toLocaleString()}</td>
                      <td>{new Date(s.expiresAt).toLocaleDateString()}</td>
                      <td>
                        {!s.isCurrent && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => revokeMutation.mutate(s.id)}
                            disabled={revokeMutation.isPending}
                          >
                            Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
