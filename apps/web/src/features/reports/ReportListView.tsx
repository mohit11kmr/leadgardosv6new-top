import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';

export interface ReportItem {
  id: string;
  title: string;
  auditId: string;
  version: number;
  status: string;
  pdfStatus: string;
  pdfPath?: string | null;
  createdAt: string;
}

export function ReportListView() {
  const queryClient = useQueryClient();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatedShareToken, setGeneratedShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api<{ items: ReportItem[]; nextCursor: string | null; hasMore: boolean }>('/reports'),
  });

  const pdfMutation = useMutation({
    mutationFn: (reportId: string) =>
      api<{ jobId: string; status: string }>(`/reports/${reportId}/pdf`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: (params: { reportId: string; password?: string; expiresInDays?: number }) =>
      api<{ shareLink: any; rawToken: string }>(`/reports/${params.reportId}/share`, {
        method: 'POST',
        body: JSON.stringify({
          password: params.password || undefined,
          expiresInDays: params.expiresInDays,
        }),
      }),
    onSuccess: (res) => {
      setGeneratedShareToken(res.rawToken);
    },
  });

  const handleCreateShareLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReportId) return;
    shareMutation.mutate({
      reportId: selectedReportId,
      password: sharePassword,
      expiresInDays,
    });
  };

  const copyToClipboard = (token: string) => {
    const url = `${window.location.origin}/public/reports/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <h1 className="viewTitle">Diagnostic Reports</h1>
          <p className="viewSubtitle">
            Immutable executive snapshots with cryptographic client share links and white-label exports.
          </p>
        </div>
      </div>

      {isLoading && <div className="loadingState">Loading reports...</div>}
      {error && <div className="errorBanner">{(error as Error).message}</div>}

      {!isLoading && !error && (
        <div className="tableCard">
          {data?.items && data.items.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Report Title</th>
                  <th>Audit ID</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>PDF Export</th>
                  <th>Generated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <Link to={`/reports/${report.id}`} className="tableLink font-semibold">
                        {report.title}
                      </Link>
                    </td>
                    <td className="codeSnippet">{report.auditId.slice(0, 8)}...</td>
                    <td>v{report.version}</td>
                    <td>
                      <span className="badge badge-success">{report.status}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          report.pdfStatus === 'READY'
                            ? 'badge-success'
                            : report.pdfStatus === 'GENERATING' || report.pdfStatus === 'QUEUED'
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {report.pdfStatus}
                      </span>
                    </td>
                    <td>{new Date(report.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedReportId(report.id);
                            setGeneratedShareToken(null);
                            setSharePassword('');
                            setIsShareModalOpen(true);
                          }}
                        >
                          🔗 Share
                        </button>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={pdfMutation.isPending || report.pdfStatus === 'GENERATING'}
                          onClick={() => pdfMutation.mutate(report.id)}
                        >
                          {report.pdfStatus === 'READY' ? '📥 Re-render' : '📄 Render PDF'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="emptyState">
              <div className="emptyIcon">📄</div>
              <h3>No diagnostic reports generated yet</h3>
              <p>Reports are immutable snapshots generated from completed audit runs.</p>
              <Link to="/audits" className="btn btn-primary mt-4">
                View Audits to Generate Report
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Share Link Modal */}
      {isShareModalOpen && (
        <div className="modalBackdrop">
          <div className="modalCard">
            <h2 className="modalTitle">Create Cryptographic Share Link</h2>
            <p className="modalSubtitle">
              Generate a secure, sanitized public link to share this report with prospects or clients.
            </p>

            {!generatedShareToken ? (
              <form onSubmit={handleCreateShareLink} className="space-y-4">
                <div className="formGroup">
                  <label className="formLabel">Password Protection (Optional)</label>
                  <input
                    type="password"
                    className="formInput"
                    placeholder="Leave empty for unpassworded link"
                    value={sharePassword}
                    onChange={(e) => setSharePassword(e.target.value)}
                  />
                  <small className="formHelp">If set, visitors must enter this password to unlock the snapshot.</small>
                </div>

                <div className="formGroup">
                  <label className="formLabel">Expiration (Days)</label>
                  <input
                    type="number"
                    className="formInput"
                    min="1"
                    max="365"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  />
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setIsShareModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={shareMutation.isPending}
                  >
                    {shareMutation.isPending ? 'Generating...' : 'Generate Secure Link'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="alertBanner success">
                  <strong>Secure Share Link Generated!</strong>
                  <p>This token is stored as a cryptographic hash. Copy and share the URL below:</p>
                </div>

                <div className="codeBox">
                  <code>{`${window.location.origin}/public/reports/${generatedShareToken}`}</code>
                </div>

                <div className="modalActions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(generatedShareToken)}
                  >
                    {copied ? '✅ Copied to Clipboard!' : '📋 Copy URL'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsShareModalOpen(false)}
                  >
                    Done
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
