import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api.js';

export interface WebhookItem {
  id: string;
  url: string;
  events: string[];
  description?: string | null;
  enabled: boolean;
  createdAt: string;
  recentDeliveries: Array<{
    id: string;
    event: string;
    status: string;
    statusCode: number | null;
    attempts: number;
    createdAt: string;
  }>;
}

const SUPPORTED_EVENTS = [
  { id: 'AUDIT_COMPLETED', label: 'Audit Completed' },
  { id: 'AUDIT_FAILED', label: 'Audit Failed' },
  { id: 'MONITORING_ALERT', label: 'Monitoring Alert Triggered' },
  { id: 'MONITORING_RESOLVED', label: 'Monitoring Alert Resolved' },
  { id: 'REPORT_READY', label: 'Report Snapshot Ready' },
  { id: 'PAYMENT_SUCCEEDED', label: 'Payment Succeeded' },
  { id: 'SUBSCRIPTION_CHANGED', label: 'Subscription Changed' },
];

export function WebhooksView() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['*']);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<string | null>(null);

  const { data: webhooks, isLoading, error } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api<WebhookItem[]>('/webhooks'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { url: string; events: string[]; description?: string }) =>
      api<{ endpoint: any; secret: string }>('/webhooks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setGeneratedSecret(res.secret);
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const pingMutation = useMutation({
    mutationFn: (id: string) => api<{ success: boolean; deliveryId: string }>(`/webhooks/${id}/ping`, { method: 'POST' }),
    onSuccess: (res) => {
      setPingStatus(`Ping event enqueued (Delivery ID: ${res.deliveryId.slice(0, 8)}...)`);
      setTimeout(() => setPingStatus(null), 3000);
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      url,
      events: selectedEvents,
      description: description || undefined,
    });
  };

  const toggleEvent = (eventId: string) => {
    if (eventId === '*') {
      setSelectedEvents(['*']);
      return;
    }
    setSelectedEvents((prev) => {
      const filtered = prev.filter((e) => e !== '*');
      return filtered.includes(eventId) ? filtered.filter((e) => e !== eventId) : [...filtered, eventId];
    });
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Webhooks & Event Streams</h1>
          <p className="viewSubtitle">
            Configure secure HTTP webhooks signed with HMAC-SHA256 signatures for real-time domain event integration.
          </p>
        </div>
        <div className="headerActions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setGeneratedSecret(null);
              setUrl('');
              setDescription('');
              setSelectedEvents(['*']);
              setIsAddModalOpen(true);
            }}
          >
            + Add Webhook Endpoint
          </button>
        </div>
      </div>

      {pingStatus && <div className="alertBanner success mb-4">{pingStatus}</div>}
      {isLoading && <div className="loadingState">Loading webhooks...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="space-y-4">
          {webhooks && webhooks.length > 0 ? (
            webhooks.map((endpoint) => (
              <div key={endpoint.id} className="card p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="badge badge-success">Active</span>
                      <strong className="text-lg">{endpoint.url}</strong>
                    </div>
                    {endpoint.description && <p className="text-muted text-sm mt-1">{endpoint.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {endpoint.events.map((ev) => (
                        <span key={ev} className="badge badge-neutral text-xs">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => pingMutation.mutate(endpoint.id)}
                      disabled={pingMutation.isPending}
                    >
                      🚀 Send Test Ping
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => deleteMutation.mutate(endpoint.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Recent Deliveries */}
                <div className="mt-4 border-t pt-3">
                  <h4 className="text-sm font-semibold text-muted mb-2">Recent Deliveries</h4>
                  {endpoint.recentDeliveries.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {endpoint.recentDeliveries.map((del) => (
                        <div key={del.id} className="text-xs p-2 bg-slate-800 rounded border border-slate-700">
                          <span
                            className={`badge ${
                              del.status === 'SUCCESS'
                                ? 'badge-success'
                                : del.status === 'RETRYING'
                                ? 'badge-warning'
                                : 'badge-error'
                            }`}
                          >
                            {del.event} ({del.status})
                          </span>
                          <span className="ml-2 text-muted">
                            HTTP {del.statusCode || 'N/A'} • {new Date(del.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted">No recent delivery attempts recorded.</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="tableCard">
              <div className="emptyState">
                <div className="emptyIcon">⚡</div>
                <h3>No webhook endpoints configured</h3>
                <p>Register an endpoint to receive live real-time event updates.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Webhook Modal */}
      {isAddModalOpen && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h2 className="modalTitle">Register Webhook Endpoint</h2>

            {!generatedSecret ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="formGroup">
                  <label className="formLabel">Payload URL</label>
                  <input
                    type="url"
                    className="formInput"
                    placeholder="https://your-domain.com/webhooks/leadguard"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="formGroup">
                  <label className="formLabel">Description (Optional)</label>
                  <input
                    type="text"
                    className="formInput"
                    placeholder="e.g. Production Slack notifier"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="formGroup">
                  <label className="formLabel">Subscribed Events</label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold mb-2">
                    <input
                      type="checkbox"
                      checked={selectedEvents.includes('*')}
                      onChange={() => toggleEvent('*')}
                    />
                    All Events (<code>*</code>)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SUPPORTED_EVENTS.map((ev) => (
                      <label key={ev.id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes('*') || selectedEvents.includes(ev.id)}
                          disabled={selectedEvents.includes('*')}
                          onChange={() => toggleEvent(ev.id)}
                        />
                        {ev.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createMutation.isPending || !url}
                  >
                    {createMutation.isPending ? 'Registering...' : 'Register Endpoint'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="alertBanner warning">
                  <strong>Save your Webhook Signing Secret!</strong>
                  <p>Use this secret to verify the HMAC-SHA256 signatures of incoming requests.</p>
                </div>

                <div className="codeBox">
                  <code>{generatedSecret}</code>
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsAddModalOpen(false)}
                  >
                    I have stored the secret
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
