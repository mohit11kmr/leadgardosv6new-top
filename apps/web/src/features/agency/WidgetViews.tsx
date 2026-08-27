import React, { useEffect, useState } from 'react';
import { agencyApi, type Widget } from '../../api/agency.js';

export function WidgetsView() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [allowedOrigins, setAllowedOrigins] = useState('https://myagency.com');
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'AUTO'>('LIGHT');
  const [displayMode, setDisplayMode] = useState<'EMBED' | 'MODAL' | 'FLOATING_BUTTON'>('EMBED');
  const [createdWidget, setCreatedWidget] = useState<Widget | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{ widgetId: string; rawToken: string } | null>(null);

  const fetchWidgets = () => {
    setLoading(true);
    agencyApi
      .getWidgets()
      .then((data) => {
        setWidgets(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchWidgets();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const origins = allowedOrigins
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean);
      const res = await agencyApi.createWidget({
        name,
        allowedOrigins: origins,
        theme,
        displayMode,
      });
      setCreatedWidget(res);
      fetchWidgets();
    } catch (err: any) {
      alert(err.message || 'Failed to create widget');
    }
  };

  const handleRegenerateToken = async (widgetId: string) => {
    if (!confirm('Regenerating this token will immediately invalidate any live widget embedding the old token. Are you sure?')) {
      return;
    }
    try {
      const res = await agencyApi.regenerateWidgetToken(widgetId);
      setRotatedToken({ widgetId, rawToken: res.rawToken });
    } catch (err: any) {
      alert(err.message || 'Failed to rotate widget token');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Diagnostic Studio Lead Widgets</h1>
          <p className="text-slate-500">Embed branded audit forms on your agency website to capture inbound clients</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreatedWidget(null); setShowModal(true); }}>
          + Create New Widget
        </button>
      </div>

      {rotatedToken && (
        <div className="card bg-amber-50 border-amber-200 text-amber-900 p-4 space-y-2">
          <div className="font-bold flex justify-between">
            <span>🔑 New Widget Token Generated (Save it now — will never be shown again)</span>
            <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setRotatedToken(null)}>✕</button>
          </div>
          <div className="font-mono bg-white p-2 border rounded text-xs select-all text-slate-800">
            {rotatedToken.rawToken}
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">Loading widgets...</div>
      ) : widgets.length === 0 ? (
        <div className="card text-center p-12 space-y-4">
          <div className="text-4xl">📡</div>
          <h3 className="font-semibold text-slate-700">No Diagnostic Widgets Configured</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Generate an embeddable website audit widget with custom allowed origins and themes to capture business leads on your site.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            Create First Widget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {widgets.map((w) => (
            <div key={w.id} className="card space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{w.name}</h3>
                  <span className="text-xs text-slate-400">ID: {w.id}</span>
                </div>
                <div className="flex gap-2 items-center">
                  <span className={`badge ${w.enabled ? 'badge-emerald' : 'badge-slate'}`}>
                    {w.enabled ? 'Active' : 'Disabled'}
                  </span>
                  <button
                    className="btn btn-secondary btn-xs text-xs"
                    onClick={() => handleRegenerateToken(w.id)}
                    title="Rotate public authentication token"
                  >
                    🔄 Rotate Token
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded">
                <div>Theme: <strong>{w.theme}</strong></div>
                <div>Mode: <strong>{w.displayMode}</strong></div>
                <div className="col-span-2 truncate">
                  Allowed Origins: <strong>{w.allowedOrigins.join(', ') || 'Exact Origin Required'}</strong>
                </div>
              </div>

              <div className="p-2 bg-slate-900 text-emerald-400 rounded text-xs font-mono overflow-x-auto">
                {`<script src="https://app.leadguard.io/widget.js" data-widget-id="${w.id}"></script>`}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modalBackdrop">
          <div className="modalCard card max-w-lg">
            <h2 className="text-xl font-bold mb-4">
              {createdWidget ? '🎉 Widget Created Successfully' : 'New Diagnostic Studio Widget'}
            </h2>

            {createdWidget ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded text-xs space-y-1">
                  <div className="font-bold">⚠️ Secret Widget Token (Shown Once):</div>
                  <div className="font-mono bg-white p-2 border rounded select-all text-slate-800">
                    {createdWidget.rawToken}
                  </div>
                  <p className="text-[11px] text-amber-700">
                    Copy and store this token securely. It will never be displayed in plain text again.
                  </p>
                </div>

                <p className="text-sm text-slate-600">
                  Embed snippet for your website:
                </p>
                <div className="p-3 bg-slate-900 text-emerald-400 rounded text-xs font-mono">
                  {`<script src="https://app.leadguard.io/widget.js" data-widget-id="${createdWidget.id}" data-token="${createdWidget.rawToken}"></script>`}
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setCreatedWidget(null);
                      setShowModal(false);
                      setName('');
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="label">Widget Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    placeholder="e.g. Agency Homepage Lead Magnet"
                  />
                </div>

                <div>
                  <label className="label">Allowed Origins (Exact origins, one per line) *</label>
                  <textarea
                    required
                    value={allowedOrigins}
                    onChange={(e) => setAllowedOrigins(e.target.value)}
                    className="input font-mono text-xs"
                    rows={3}
                    placeholder="https://myagency.com&#10;https://staging.myagency.com"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Exact domain matches only (e.g. https://myagency.com). Wildcard '*' is rejected by default.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Theme</label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as any)}
                      className="input"
                    >
                      <option value="LIGHT">Light</option>
                      <option value="DARK">Dark</option>
                      <option value="AUTO">Auto (System)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Display Mode</label>
                    <select
                      value={displayMode}
                      onChange={(e) => setDisplayMode(e.target.value as any)}
                      className="input"
                    >
                      <option value="EMBED">Inline Embed</option>
                      <option value="MODAL">Popup Modal</option>
                      <option value="FLOATING_BUTTON">Floating Badge</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Create Widget
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
