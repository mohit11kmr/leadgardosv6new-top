import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export interface NotificationPrefs {
  id: string;
  channel: string;
  eventTypes: string[];
  enabled: boolean;
}

const AVAILABLE_ALERTS = [
  { id: 'AUDIT_COMPLETED', label: 'Audit Completed', desc: 'Email notification when a diagnostic audit is finalized' },
  { id: 'MONITORING_ALERT', label: 'Watchdog Outage Alerts', desc: 'Immediate email alert when a monitored website goes down or fails SSL check' },
  { id: 'BILLING_INVOICE', label: 'Billing & Invoice Receipts', desc: 'Payment confirmation receipts and monthly subscription invoice PDFs' },
];

export function NotificationSettingsView() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const { data: prefs, isLoading, error } = useQuery({
    queryKey: ['settings-notifications'],
    queryFn: () => api<NotificationPrefs>('/settings/notifications'),
  });

  useEffect(() => {
    if (prefs) {
      setEnabled(prefs.enabled);
      setSelectedEvents(prefs.eventTypes || []);
    }
  }, [prefs]);

  const updateMutation = useMutation({
    mutationFn: (data: { eventTypes: string[]; enabled: boolean }) =>
      api<NotificationPrefs>('/settings/notifications', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings-notifications'] });
    },
  });

  const toggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((e) => e !== eventId) : [...prev, eventId]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ eventTypes: selectedEvents, enabled });
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Notification Preferences</h1>
          <p className="viewSubtitle">
            Configure automated email notifications and critical alert delivery channels.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <aside className="col-span-1">
          <nav className="space-y-1">
            <Link to="/settings" className="sidebarLink">
              👤 Personal Profile
            </Link>
            <Link to="/settings/notifications" className="sidebarLink active">
              🔔 Notifications
            </Link>
            <Link to="/settings/security" className="sidebarLink">
              🛡️ Active Sessions & Security
            </Link>
            <Link to="/billing" className="sidebarLink">
              💳 Plans & Invoices
            </Link>
          </nav>
        </aside>

        <main className="col-span-3">
          {isLoading && <div className="loadingState">Loading preferences...</div>}
          {error && <div className="errorBanner">{(error as Error).message}</div>}

          {savedSuccess && (
            <div className="alertBanner success mb-4">
              Notification preferences saved successfully!
            </div>
          )}

          {prefs && (
            <div className="card p-6">
              <form onSubmit={handleSave} className="space-y-6 max-w-xl">
                <div className="formGroup">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="w-5 h-5"
                    />
                    <div>
                      <strong className="text-base">Enable Email Notifications</strong>
                      <div className="text-muted text-xs">
                        Master toggle for transactional notifications and critical alerts
                      </div>
                    </div>
                  </label>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Subscribed Notification Types</h3>
                  <div className="space-y-3">
                    {AVAILABLE_ALERTS.map((alert) => (
                      <label key={alert.id} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(alert.id)}
                          onChange={() => toggleEvent(alert.id)}
                          disabled={!enabled}
                          className="mt-1"
                        />
                        <div>
                          <strong>{alert.label}</strong>
                          <div className="text-muted text-xs">{alert.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Notification Preferences'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
