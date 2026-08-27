import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { agencyApi, type ClientWorkspace } from '../../api/agency.js';

export function ClientListView() {
  const [clients, setClients] = useState<ClientWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchClients = () => {
    setLoading(true);
    agencyApi
      .getClients()
      .then((res) => {
        setClients(res.items);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load client workspaces');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await agencyApi.createClient({ name, contactName, contactEmail, notes });
      setShowCreateModal(false);
      setName('');
      setContactName('');
      setContactEmail('');
      setNotes('');
      fetchClients();
    } catch (err: any) {
      alert(err.message || 'Failed to create client workspace');
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Client Workspaces</h1>
          <p className="text-slate-500">Isolate client websites, audits, reports, and custom branding</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + New Client Workspace
        </button>
      </div>

      {error && <div className="card errorBanner">{error}</div>}

      {loading ? (
        <div className="card">Loading workspaces...</div>
      ) : clients.length === 0 ? (
        <div className="card text-center p-12 space-y-4">
          <div className="text-4xl">🏢</div>
          <h3 className="font-semibold text-slate-700">No Client Workspaces Yet</h3>
          <p className="text-slate-500 max-w-md mx-auto">
            Create dedicated workspaces for your agency clients to manage their websites, audits, and white-label reports.
          </p>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            Create First Workspace
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="card space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{client.name}</h3>
                  <span className="text-xs text-slate-400">/{client.slug}</span>
                </div>
                <span className={`badge ${client.status === 'ACTIVE' ? 'badge-emerald' : 'badge-slate'}`}>
                  {client.status}
                </span>
              </div>

              {client.contactName && (
                <div className="text-sm text-slate-600">
                  👤 {client.contactName} {client.contactEmail && `(${client.contactEmail})`}
                </div>
              )}

              <div className="flex justify-between text-xs text-slate-500 pt-2 border-t">
                <span>🌐 {client._count?.websites ?? 0} websites</span>
                <span>🎯 {client._count?.prospectCampaigns ?? 0} campaigns</span>
              </div>

              <Link to={`/agency/clients/${client.id}`} className="btn btn-sm btn-outline w-full text-center">
                Open Client Workspace →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modalBackdrop">
          <div className="modalCard card">
            <h2 className="text-xl font-bold mb-4">New Client Workspace</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Client / Company Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Apex Health Clinic"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Primary Contact</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="input"
                    placeholder="e.g. Dr. Jane Smith"
                  />
                </div>
                <div>
                  <label className="label">Contact Email</label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="input"
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="label">Notes / Instructions</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Internal notes about this client account..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientWorkspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    agencyApi
      .getClient(id)
      .then((data) => {
        setClient(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 card">Loading client workspace...</div>;
  if (!client) return <div className="p-8 card errorBanner">Client workspace not found.</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Link to="/agency/clients" className="text-sm text-indigo-600 hover:underline">
            ← Back to Workspaces
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">{client.name}</h1>
          <span className="text-sm text-slate-500">Contact: {client.contactName || 'None'} ({client.contactEmail || 'No email'})</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="card space-y-4">
            <h3 className="font-bold text-slate-800">Assigned Websites</h3>
            {client.websites && client.websites.length > 0 ? (
              <div className="space-y-2">
                {client.websites.map((w) => (
                  <div key={w.id} className="p-3 bg-slate-50 rounded flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{w.name}</div>
                      <div className="text-xs text-slate-500">{w.url}</div>
                    </div>
                    <Link to={`/websites/${w.id}`} className="btn btn-xs btn-outline">
                      View Audits →
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No websites assigned yet to this client.</p>
            )}
          </div>

          <div className="card space-y-4">
            <h3 className="font-bold text-slate-800">Workspace Notes</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes || 'No notes added for this workspace.'}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-4">
            <h3 className="font-bold text-slate-800">White-Label Branding</h3>
            <div className="text-sm text-slate-600 space-y-2">
              <div>
                <strong>Brand Name:</strong> {client.branding?.companyName || client.name}
              </div>
              <div>
                <strong>Support Email:</strong> {client.branding?.supportEmail || client.contactEmail || 'Inherit Agency Default'}
              </div>
              <div>
                <strong>Primary Color:</strong> {client.branding?.primaryColor || '#6366f1'}
              </div>
              <div>
                <strong>Footer Note:</strong> {client.branding?.footer || `Prepared for ${client.name}`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
