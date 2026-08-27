import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  locale: string | null;
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [locale, setLocale] = useState('en');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const { data: profile, isLoading, error } = useQuery({
    queryKey: ['settings-profile'],
    queryFn: () => api<UserProfile>('/settings/profile'),
  });

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setTimezone(profile.timezone || 'UTC');
      setLocale(profile.locale || 'en');
    }
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; timezone?: string; locale?: string }) =>
      api<UserProfile>('/settings/profile', {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['settings-profile'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ name, timezone, locale });
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Account & Profile Settings</h1>
          <p className="viewSubtitle">
            Manage your personal profile, regional preferences, and account configuration.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <aside className="col-span-1">
          <nav className="space-y-1">
            <Link to="/settings" className="sidebarLink active">
              👤 Personal Profile
            </Link>
            <Link to="/settings/notifications" className="sidebarLink">
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
          {isLoading && <div className="loadingState">Loading profile...</div>}
          {error && <div className="errorBanner">{(error as Error).message}</div>}

          {savedSuccess && (
            <div className="alertBanner success mb-4">
              Profile preferences updated successfully!
            </div>
          )}

          {profile && (
            <div className="card p-6">
              <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
                <div className="formGroup">
                  <label className="formLabel">Email Address (Read-only)</label>
                  <input
                    type="email"
                    className="formInput bg-slate-800 cursor-not-allowed"
                    value={profile.email}
                    disabled
                  />
                  <small className="formHelp">Contact support to modify primary email.</small>
                </div>

                <div className="formGroup">
                  <label className="formLabel">Full Name</label>
                  <input
                    type="text"
                    className="formInput"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="formGroup">
                  <label className="formLabel">Timezone</label>
                  <select
                    className="formSelect"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>

                <div className="formGroup">
                  <label className="formLabel">Language / Locale</label>
                  <select
                    className="formSelect"
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                  >
                    <option value="en">English (US/UK)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                  </select>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Profile'}
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
