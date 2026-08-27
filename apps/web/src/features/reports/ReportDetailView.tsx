import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api.js';

export function ReportDetailView() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api<any>(`/reports/${id}`),
    enabled: Boolean(id),
  });

  const revokeShareMutation = useMutation({
    mutationFn: (shareId: string) =>
      api(`/reports/${id}/share/${shareId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
    },
  });

  if (isLoading) return <div className="loadingState">Loading report snapshot...</div>;
  if (error || !data) return <div className="errorBanner">{(error as Error)?.message || 'Report not found'}</div>;

  const snapshot = data.snapshotData || {};
  const score = snapshot.score || { overall: 70, lead: 70, advertising: 70, seo: 70, security: 70 };
  const findings = snapshot.findings || [];
  const branding = snapshot.branding || { companyName: 'LeadGuard' };

  return (
    <div className="viewContainer">
      <div className="viewHeader">
        <div>
          <div className="breadcrumb">
            <Link to="/reports">Reports</Link> / <span>{data.title}</span>
          </div>
          <h1 className="viewTitle">{data.title}</h1>
          <p className="viewSubtitle">
            Immutable snapshot created {new Date(data.createdAt).toLocaleString()} • Target: {snapshot.website?.url}
          </p>
        </div>
        <div className="headerActions">
          <Link to="/reports" className="btn btn-secondary btn-sm">
            ← Back to Reports
          </Link>
        </div>
      </div>

      {/* Score Grid */}
      <div className="statsGrid">
        <div className="statCard primary">
          <div className="statLabel">Overall Health</div>
          <div className="statValue">{score.overall} / 100</div>
          <div className="statSub">Status: {snapshot.businessImpact?.conversionHealth || 'HEALTHY'}</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Lead Capture</div>
          <div className="statValue">{score.lead} / 100</div>
          <div className="statSub">Inbound readiness</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Advertising / Tracking</div>
          <div className="statValue">{score.advertising} / 100</div>
          <div className="statSub">Attribution & Pixels</div>
        </div>
        <div className="statCard">
          <div className="statLabel">SEO & Metadata</div>
          <div className="statValue">{score.seo} / 100</div>
          <div className="statSub">Search visibility</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Security & TLS</div>
          <div className="statValue">{score.security} / 100</div>
          <div className="statSub">Headers & Certificates</div>
        </div>
      </div>

      {/* Prioritized Findings Table */}
      <div className="contentSection">
        <h2 className="sectionTitle">Prioritized Diagnostic Findings ({findings.length})</h2>
        <div className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Category</th>
                <th>Diagnostic Finding</th>
                <th>Recommendation</th>
                <th>Score Impact</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f: any) => (
                <tr key={f.id}>
                  <td>
                    <span
                      className={`badge ${
                        f.severity === 'CRITICAL'
                          ? 'badge-error'
                          : f.severity === 'HIGH'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                    >
                      {f.severity}
                    </span>
                  </td>
                  <td>{f.category}</td>
                  <td>
                    <strong>{f.title}</strong>
                    <div className="text-muted text-sm">{f.description}</div>
                  </td>
                  <td className="text-sm">{f.recommendation}</td>
                  <td className="text-error font-bold">-{f.scoreImpact} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Share Links Section */}
      <div className="contentSection">
        <h2 className="sectionTitle">Active Cryptographic Share Links</h2>
        <div className="tableCard">
          {data.shareLinks && data.shareLinks.length > 0 ? (
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Share Link ID</th>
                  <th>Password Protected</th>
                  <th>Total Views</th>
                  <th>Last Accessed</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.shareLinks.map((link: any) => (
                  <tr key={link.id}>
                    <td className="codeSnippet">{link.id.slice(0, 12)}...</td>
                    <td>{link.isPasswordProtected ? '🔒 Yes' : '🌐 Public'}</td>
                    <td>{link.accessCount}</td>
                    <td>{link.lastAccessedAt ? new Date(link.lastAccessedAt).toLocaleString() : 'Never'}</td>
                    <td>{link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => revokeShareMutation.mutate(link.id)}
                        disabled={revokeShareMutation.isPending}
                      >
                        Revoke Link
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-muted">No active share links created for this report yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
