import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWebsite } from '../../api/websites.js';
import {
  getVaultRuns,
  triggerVaultRun,
  type VaultAuditRun,
} from '../../api/security.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { Input } from '../../components/ui/Input.js';
import { Skeleton, ErrorState, EmptyState } from '../../components/ui/States.js';
import { IconShield, IconArrowRight } from '../../components/ui/Icons.js';

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

export function SecurityAuditView() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [maxPages, setMaxPages] = useState(10);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const { data: website, isLoading: loadingWebsite } = useQuery({
    queryKey: ['website', id],
    queryFn: () => getWebsite(id!),
    enabled: Boolean(id),
  });

  const {
    data: runs,
    isLoading: loadingRuns,
    error: runsError,
  } = useQuery<VaultAuditRun[]>({
    queryKey: ['vault-runs', id],
    queryFn: () => getVaultRuns(id!, { limit: 25 }),
    enabled: Boolean(id),
  });

  const runMutation = useMutation({
    mutationFn: () => triggerVaultRun(id!, { mode: 'STANDARD', maxPages }),
    onSuccess: (data) => {
      setIsRunModalOpen(false);
      setActionMessage('Security audit enqueued. Results will appear shortly.');
      navigate(`/websites/${id}/security-audit/${data.id}`);
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Failed to start security audit');
    },
  });

  if (loadingWebsite || loadingRuns) {
    return (
      <div className="pageContainer">
        <Skeleton height="60px" className="mb4" />
        <Skeleton height="200px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (!website) {
    return (
      <div className="pageContainer">
        <ErrorState message="Website not found." />
        <Link to="/websites" className="mt3 inlineBlock">← Back to Websites</Link>
      </div>
    );
  }

  if (runsError) {
    return (
      <div className="pageContainer">
        <ErrorState message="Failed to load security audit runs." />
      </div>
    );
  }

  const openCount = (runs || []).filter((r) => r.status === 'COMPLETED' || r.status === 'PARTIAL').length;

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <Link to={`/websites/${id}`} className="textMuted textSm mb1 inlineBlock">
            ← Back to {website.name}
          </Link>
          <h1>VaultGuard Security Audit</h1>
          <p className="pageSubtext">
            {website.url} — Deep vulnerability scanning, hardening, and retest tracking.
          </p>
        </div>
        <Button variant="primary" onClick={() => setIsRunModalOpen(true)}>
          <IconShield size={16} /> Run New Security Audit
        </Button>
      </div>

      {actionMessage && (
        <div className="authSuccessMessage mb4">
          <p>{actionMessage}</p>
        </div>
      )}

      <div className="metricsGrid mb4">
        <Card>
          <span className="metricLabel">Completed Audits</span>
          <div className="metricValue mt2">{openCount}</div>
          <p className="textMuted textSm mt1">Standard + retest runs</p>
        </Card>
        <Card>
          <span className="metricLabel">Latest Security Score</span>
          <div className="metricValue mt2">
            {runs && runs.length > 0 && (runs[0].score > 0 || runs[0].status === 'COMPLETED' || runs[0].status === 'PARTIAL')
              ? `${runs[0].score}/100`
              : '—'}
          </div>
          <p className="textMuted textSm mt1">Most recent completed run</p>
        </Card>
        <Card>
          <span className="metricLabel">Retest Coverage</span>
          <div className="metricValue mt2">
            {runs?.reduce((acc, r) => acc + r.retestedFindings, 0) || 0}
          </div>
          <p className="textMuted textSm mt1">Findings revalidated</p>
        </Card>
      </div>

      <h2 className="mb3">Audit Run History</h2>
      {!runs || runs.length === 0 ? (
        <Card>
          <EmptyState
            title="No Security Audits Yet"
            description="Run your first VaultGuard security audit to detect critical vulnerabilities, hardening gaps, and track fixes over time."
            actionText="Run Security Audit"
            onAction={() => setIsRunModalOpen(true)}
            icon={<IconShield size={40} color="#8b5cf6" />}
          />
        </Card>
      ) : (
        <Card className="tableCard">
          <table className="dataTable">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Status</th>
                <th>Security Score</th>
                <th>Findings</th>
                <th>Coverage</th>
                <th>Retested / Fixed</th>
                <th>Ran At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Badge variant={run.mode === 'RETEST' ? 'purple' : 'neutral'} size="sm">
                      {run.mode}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={statusVariant(run.status)} size="sm">
                      {run.status}
                    </Badge>
                  </td>
                  <td>
                    {(run.status === 'COMPLETED' || run.status === 'PARTIAL') && run.score > 0 ? (
                      <span className={`scoreBadge score-${run.score >= 80 ? 'green' : run.score >= 60 ? 'yellow' : 'red'}`}>
                        {run.score}/100
                      </span>
                    ) : (
                      <span className="textMuted">—</span>
                    )}
                  </td>
                  <td>{run.findingsCount} issues</td>
                  <td className="textSm">
                    {run.pagesFetched}/{run.pagesDiscovered} pages
                  </td>
                  <td className="textSm">
                    {run.retestedFindings} / {run.fixedFindings}
                  </td>
                  <td className="textSm">{new Date(run.createdAt).toLocaleString()}</td>
                  <td>
                    <Link to={`/websites/${id}/security-audit/${run.id}`} className="btn btn-outline btn-sm">
                      View Detail <IconArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {isRunModalOpen && (
        <Modal
          isOpen={isRunModalOpen}
          title="Run VaultGuard Security Audit"
          onClose={() => setIsRunModalOpen(false)}
        >
          <p className="textMuted textSm mb3">
            Launches a deep vulnerability scan of {website.name} ({website.url}). The audit runs
            asynchronously; you will be taken to the run detail as soon as it is enqueued.
          </p>
          <div className="formGroup mb4">
            <label htmlFor="vaultMaxPages">Crawl Page Limit</label>
            <select
              id="vaultMaxPages"
              className="formControl"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
            >
              <option value={5}>5 Bounded Pages</option>
              <option value={10}>10 Bounded Pages (Standard)</option>
              <option value={25}>25 Bounded Pages (Deep)</option>
              <option value={50}>50 Bounded Pages (Maximum)</option>
            </select>
          </div>
          <div className="modalActions">
            <Button variant="ghost" onClick={() => setIsRunModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={runMutation.isPending}
              onClick={() => runMutation.mutate()}
            >
              <IconShield size={14} /> Start Security Audit
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
