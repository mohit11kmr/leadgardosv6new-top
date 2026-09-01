import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient as api } from '../../api/client.js';

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { id: 'AUDIT_READ', label: 'Read Audits', desc: 'Query audit status, scores, and findings' },
  { id: 'AUDIT_RUN', label: 'Run Audits', desc: 'Trigger new diagnostic audits' },
  { id: 'REPORT_READ', label: 'Read Reports', desc: 'Access immutable report snapshots' },
  { id: 'MONITORING_READ', label: 'Read Monitors', desc: 'View uptime health status and metrics' },
  { id: 'MONITORING_RUN', label: 'Run Monitors', desc: 'Execute on-demand health checks' },
  { id: 'WEBSITE_READ', label: 'Read Websites', desc: 'Query configured websites' },
];

export function ApiKeysView() {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['AUDIT_READ', 'REPORT_READ']);
  const [expiresInDays, setExpiresInDays] = useState(365);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: keys, isLoading, error } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => api<ApiKeyItem[]>('/api-keys'),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; scopes: string[]; expiresInDays: number }) =>
      api<{ apiKey: ApiKeyItem; rawKey: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (res) => {
      setGeneratedKey(res.rawKey);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api(`/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: keyName,
      scopes: selectedScopes,
      expiresInDays,
    });
  };

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const copyKey = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">API Keys & Scoped Credentials</h1>
          <p className="viewSubtitle">
            Generate least-privilege API keys to authenticate with the LeadGuard OS V6 Developer API.
          </p>
        </div>
        <div className="headerActions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setGeneratedKey(null);
              setKeyName('');
              setSelectedScopes(['AUDIT_READ', 'REPORT_READ']);
              setIsCreateModalOpen(true);
            }}
          >
            + Generate API Key
          </button>
        </div>
      </div>

      {isLoading && <div className="loadingState">Loading API keys...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          {keys && keys.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Key Name</th>
                  <th>Prefix</th>
                  <th>Granted Scopes</th>
                  <th>Last Used</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-semibold">{k.name}</td>
                    <td>
                      <code className="codeSnippet">{k.keyPrefix}...</code>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map((s) => (
                          <span key={s} className="badge badge-neutral text-xs">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                    <td>{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => revokeMutation.mutate(k.id)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="emptyState">
              <div className="emptyIcon">🔑</div>
              <h3>No API keys generated</h3>
              <p>Generate an API key to access programmatic endpoints.</p>
            </div>
          )}
        </div>
      )}

      {/* Create Key Modal */}
      {isCreateModalOpen && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h2 className="modalTitle">Create Scoped API Key</h2>

            {!generatedKey ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="formGroup">
                  <label className="formLabel">Key Description / Name</label>
                  <input
                    type="text"
                    className="formInput"
                    placeholder="e.g. CI/CD Pipeline, Zapier Integration"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    required
                  />
                </div>

                <div className="formGroup">
                  <label className="formLabel">Scopes & Permissions</label>
                  <div className="space-y-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label key={scope.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.id)}
                          onChange={() => toggleScope(scope.id)}
                          className="mt-1"
                        />
                        <div>
                          <strong>{scope.label}</strong> (<code>{scope.id}</code>)
                          <div className="text-muted text-xs">{scope.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="formGroup">
                  <label className="formLabel">Validity (Days)</label>
                  <input
                    type="number"
                    className="formInput"
                    min="1"
                    max="730"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  />
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createMutation.isPending || !keyName}
                  >
                    {createMutation.isPending ? 'Generating...' : 'Create API Key'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="alertBanner warning">
                  <strong>Save your API Key!</strong>
                  <p>For security reasons, this key will NEVER be shown again. Copy it now.</p>
                </div>

                <div className="codeBox">
                  <code>{generatedKey}</code>
                </div>

                <div className="modalActions">
                  <button type="button" className="btn btn-secondary" onClick={copyKey}>
                    {copied ? '✅ Copied!' : '📋 Copy API Key'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    I have saved it
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
