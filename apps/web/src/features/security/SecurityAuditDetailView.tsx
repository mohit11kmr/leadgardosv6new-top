import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWebsite } from '../../api/websites.js';
import {
  getVaultRun,
  getVaultFindings,
  retestVaultRun,
  updateVaultFinding,
  generateVaultReport,
  createReportShareLink,
  enqueueReportPdf,
  type VaultAuditRun,
  type VaultAuditFinding,
  type VaultFindingStatus,
} from '../../api/security.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { ScoreRing } from '../../components/ui/ScoreRing.js';
import { Skeleton, ErrorState, EmptyState } from '../../components/ui/States.js';
import {
  IconShield,
  IconArrowRight,
  IconRefresh,
  IconFileText,
  IconCheckCircle,
} from '../../components/ui/Icons.js';

function statusVariant(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'success' as const;
    case 'PARTIAL':
      return 'medium' as const;
    case 'QUEUED':
    case 'RUNNING':
      return 'info' as const;
    case 'CANCELLED':
      return 'neutral' as const;
    default:
      return 'critical' as const;
  }
}

function severityVariant(s: string) {
  switch (s) {
    case 'CRITICAL':
      return 'critical' as const;
    case 'HIGH':
      return 'high' as const;
    case 'MEDIUM':
      return 'medium' as const;
    case 'LOW':
      return 'low' as const;
    default:
      return 'neutral' as const;
  }
}

function findingStatusVariant(s: VaultFindingStatus) {
  switch (s) {
    case 'FIXED':
      return 'success' as const;
    case 'VERIFIED':
      return 'emerald' as const;
    case 'TRIAGED':
      return 'info' as const;
    case 'VERIFIED_IGNORED':
      return 'neutral' as const;
    default:
      return 'warning' as const;
  }
}

export function SecurityAuditDetailView() {
  const { id: websiteId, runId } = useParams<{ id: string; runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<VaultFindingStatus | ''>('');
  const [ignoreTarget, setIgnoreTarget] = useState<VaultAuditFinding | null>(null);
  const [ignoreReason, setIgnoreReason] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [reportSaved, setReportSaved] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: website } = useQuery({
    queryKey: ['website', websiteId],
    queryFn: () => getWebsite(websiteId!),
    enabled: Boolean(websiteId),
  });

  const {
    data: run,
    isLoading: loadingRun,
    error: runError,
  } = useQuery<VaultAuditRun>({
    queryKey: ['vault-run', websiteId, runId],
    queryFn: () => getVaultRun(websiteId!, runId!),
    enabled: Boolean(websiteId && runId),
    refetchInterval: (query) => {
      const status = (query.state.data as VaultAuditRun | undefined)?.status;
      return status === 'QUEUED' || status === 'RUNNING' ? 5000 : false;
    },
  });

  const {
    data: findingsPage,
    isLoading: loadingFindings,
  } = useQuery({
    queryKey: ['vault-findings', websiteId, runId, statusFilter],
    queryFn: () => getVaultFindings(websiteId!, runId!, { status: statusFilter || undefined, page: 1, limit: 100 }),
    enabled: Boolean(websiteId && runId),
  });

  const retestMutation = useMutation({
    mutationFn: () => retestVaultRun(websiteId!, runId!),
    onSuccess: (data) => {
      setActionMessage('Retest enqueued. Open findings revalidated against the latest site build.');
      navigate(`/websites/${websiteId}/security-audit/${data.id}`);
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Failed to start retest');
    },
  });

  const triageMutation = useMutation({
    mutationFn: (f: VaultAuditFinding) =>
      updateVaultFinding(websiteId!, runId!, f.id, { status: 'TRIAGED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-findings', websiteId, runId] });
      queryClient.invalidateQueries({ queryKey: ['vault-run', websiteId, runId] });
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: () =>
      updateVaultFinding(websiteId!, runId!, ignoreTarget!.id, {
        status: 'VERIFIED_IGNORED',
        ignoreReason,
      }),
    onSuccess: () => {
      setIgnoreTarget(null);
      setIgnoreReason('');
      setActionMessage('Finding marked as verified-ignored.');
      queryClient.invalidateQueries({ queryKey: ['vault-findings', websiteId, runId] });
      queryClient.invalidateQueries({ queryKey: ['vault-run', websiteId, runId] });
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Failed to update finding');
      setIgnoreTarget(null);
    },
  });

  const reportMutation = useMutation({
    mutationFn: () => generateVaultReport(websiteId!, runId!),
    onSuccess: (data) => {
      setReportSaved(true);
      setReportTarget(data.id);
      setShareToken(null);
      setActionMessage('Branded security report generated.');
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Failed to generate report');
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => createReportShareLink(reportTarget!),
    onSuccess: (data) => {
      setShareToken(data.rawToken);
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Failed to create share link');
    },
  });

  const pdfMutation = useMutation({
    mutationFn: () => enqueueReportPdf(reportTarget!),
    onSuccess: () => {
      setActionMessage('PDF generation enqueued. Download link is prepared for this report.');
    },
  });

  if (loadingRun) {
    return (
      <div className="pageContainer">
        <Skeleton height="60px" className="mb4" />
        <Skeleton height="250px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (runError || !run) {
    return (
      <div className="pageContainer">
        <ErrorState message="Security audit run not found." />
        <Link to={`/websites/${websiteId}/security-audit`} className="mt3 inlineBlock">
          ← Back to Security Audits
        </Link>
      </div>
    );
  }

  const findings = findingsPage?.data ?? [];
  const complete = run.status === 'COMPLETED' || run.status === 'PARTIAL';
  const scoreColor = run.score >= 80 ? 'green' : run.score >= 60 ? 'yellow' : 'red';
  const summary = (run.summary as Record<string, unknown> | null) ?? {};
  const severityCounts = (summary.severityCounts ?? {}) as Record<string, number>;

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <Link to={`/websites/${websiteId}/security-audit`} className="textMuted textSm mb1 inlineBlock">
            ← Back to Security Audits
          </Link>
          <h1>Security Audit Detail</h1>
          <p className="pageSubtext">
            {website?.name ?? 'Website'} — {run.mode} run • Triggered {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="btnGroup">
          <Button
            variant="outline"
            isLoading={retestMutation.isPending}
            disabled={!complete && run.status !== 'FAILED'}
            onClick={() => retestMutation.mutate()}
          >
            <IconRefresh size={16} /> Retest Open Findings
          </Button>
          <Button
            variant="primary"
            onClick={() => reportMutation.mutate()}
            isLoading={reportMutation.isPending}
            disabled={!complete}
          >
            <IconFileText size={16} /> Generate Branded Report
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="authSuccessMessage mb4">
          <p>{actionMessage}</p>
        </div>
      )}

      <Badge variant={statusVariant(run.status)} className="mb4">
        {run.status} {complete && run.durationMs ? ` • ${run.durationMs}ms` : ''}
      </Badge>

      {/* Score + summary */}
      <div className="metricsGrid mb4">
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <ScoreRing score={run.score} label="SECURITY SCORE" size="lg" />
            <div>
              <span className="metricLabel">Findings</span>
              <div className="metricValue mt1">{run.findingsCount}</div>
              <div className="textSm mt1">
                {run.retestedFindings} retested • {run.fixedFindings} fixed
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <span className="metricLabel">Coverage</span>
          <div className="metricValue mt2">
            {run.pagesFetched}/{run.pagesDiscovered}
          </div>
          <p className="textMuted textSm mt1">
            pages fetched ({run.pagesFailed} failed) • {run.pagesDiscovered} discovered
          </p>
        </Card>

        <Card>
          <span className="metricLabel">Severity Breakdown</span>
          <div className="pillarHealthList mt2">
            <div className="textSm">Critical: <strong>{(severityCounts.CRITICAL ?? 0)}</strong></div>
            <div className="textSm">High: <strong>{(severityCounts.HIGH ?? 0)}</strong></div>
            <div className="textSm">Medium: <strong>{(severityCounts.MEDIUM ?? 0)}</strong></div>
            <div className="textSm">Low: <strong>{(severityCounts.LOW ?? 0)}</strong></div>
          </div>
        </Card>
      </div>

      {reportSaved && reportTarget && (
        <Card className="mb4">
          <div className="cardHeaderFlex">
            <h3 style={{ margin: 0 }}>Branded Security Report</h3>
            <Badge variant="purple">REPORT READY</Badge>
          </div>
          <div className="cardActionsFlex mt3">
            <Button
              variant="outline"
              size="sm"
              isLoading={shareMutation.isPending}
              disabled={Boolean(shareToken)}
              onClick={() => shareMutation.mutate()}
            >
              {shareToken ? <IconCheckCircle size={14} /> : null} {shareToken ? 'Share Link Created' : 'Create Share Link'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              isLoading={pdfMutation.isPending}
              onClick={() => pdfMutation.mutate()}
            >
              <IconFileText size={14} /> Generate PDF
            </Button>
            <Link to={`/reports/${reportTarget}`} className="btn btn-secondary btn-sm">
              Open Report <IconArrowRight size={12} />
            </Link>
          </div>
          {shareToken && (
            <div className="mt3">
              <span className="textSm textMuted">Public share link (whitelabel branded):</span>
              <div className="monoText mt1" style={{ wordBreak: 'break-all' }}>
                {window.location.origin}/public/reports/{shareToken}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Findings */}
      <div className="cardHeaderFlex mb3">
        <h2 style={{ margin: 0 }}>Security Findings</h2>
        <div className="btnGroup">
          <Button
            variant={statusFilter === '' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('')}
          >
            All ({findingsPage?.meta.total ?? run.findingsCount})
          </Button>
          <Button
            variant={statusFilter === 'OPEN' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('OPEN')}
          >
            Open
          </Button>
          <Button
            variant={statusFilter === 'VERIFIED_IGNORED' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter('VERIFIED_IGNORED')}
          >
            Ignored
          </Button>
        </div>
      </div>

      <Card className="tableCard">
        {loadingFindings ? (
          <div style={{ padding: '24px' }}>
            <Skeleton height="60px" className="mb2" />
            <Skeleton height="60px" className="mb2" />
            <Skeleton height="60px" />
          </div>
        ) : findings.length === 0 ? (
          <EmptyState
            title="No Findings"
            description="No security findings match the current filter for this run."
            icon={<IconShield size={40} color="#10b981" />}
          />
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Score Impact</th>
                <th>Affected URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Badge variant={severityVariant(f.severity)} size="sm">{f.severity}</Badge>
                  </td>
                  <td>
                    <strong>{f.title}</strong>
                    <div className="textMuted textSm">{f.description}</div>
                    {f.cwe && <div className="textSm textMuted">CWE: {f.cwe}</div>}
                  </td>
                  <td>
                    <Badge variant={findingStatusVariant(f.status)} size="sm">{f.status}</Badge>
                  </td>
                  <td className="textSm">-{f.scoreImpact} pts</td>
                  <td className="textSm fontMono">{f.affectedUrl || 'Root Website'}</td>
                  <td>
                    <div className="actionButtonsRow">
                      {f.status === 'OPEN' && (
                        <Button
                          variant="outline"
                          size="sm"
                          isLoading={triageMutation.isPending && triageMutation.variables?.id === f.id}
                          onClick={() => triageMutation.mutate(f)}
                        >
                          Triage
                        </Button>
                      )}
                      {(f.status === 'OPEN' || f.status === 'TRIAGED') && (
                        <Button variant="ghost" size="sm" onClick={() => { setIgnoreTarget(f); setIgnoreReason(''); }}>
                          Ignore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {ignoreTarget && (
        <Modal
          isOpen={Boolean(ignoreTarget)}
          title="Mark Finding as Verified-Ignored"
          onClose={() => setIgnoreTarget(null)}
        >
          <p className="textSm textMuted mb3">
            <strong>{ignoreTarget.title}</strong> — Provide a reason that will be audited to the finding.
          </p>
          <div className="formGroup mb4">
            <label className="formLabel">Ignore Reason (required)</label>
            <textarea
              className="formControl"
              rows={3}
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              placeholder="e.g. Third-party domain we do not control; acceptable business risk."
            />
          </div>
          <div className="modalActions">
            <Button variant="ghost" onClick={() => setIgnoreTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={!ignoreReason.trim()}
              isLoading={ignoreMutation.isPending}
              onClick={() => ignoreMutation.mutate()}
            >
              Confirm Ignore
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
