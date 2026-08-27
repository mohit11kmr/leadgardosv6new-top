import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMonitor,
  triggerManualRun,
  acknowledgeAlert,
  type MonitoringConfig,
} from '../../api/monitoring.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Skeleton, ErrorState } from '../../components/ui/States.js';

export function MonitorDetailView() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const {
    data: monitor,
    isLoading,
    error,
  } = useQuery<MonitoringConfig>({
    queryKey: ['monitor-detail', id],
    queryFn: () => getMonitor(id!),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });

  const runMutation = useMutation({
    mutationFn: () => triggerManualRun(id!),
    onSuccess: () => {
      setActionMessage('Watchdog monitoring scan triggered.');
      queryClient.invalidateQueries({ queryKey: ['monitor-detail', id] });
    },
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => acknowledgeAlert(id!, alertId),
    onSuccess: () => {
      setActionMessage('Alert acknowledged.');
      queryClient.invalidateQueries({ queryKey: ['monitor-detail', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="pageContainer">
        <Skeleton height="60px" className="mb4" />
        <Skeleton height="250px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (error || !monitor) {
    return (
      <div className="pageContainer">
        <ErrorState message="Monitor configuration not found." />
        <Link to="/monitoring" className="mt3 inlineBlock">
          ← Back to Watchdog Monitors
        </Link>
      </div>
    );
  }

  const latestRun = monitor.runs?.[0];
  const scores = latestRun?.scores || { lead: 0, advertising: 0, seo: 0, security: 0, overall: 0 };
  const deltas = latestRun?.scoreDeltas || { lead: 0, advertising: 0, seo: 0, security: 0, overall: 0 };

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <Link to="/monitoring" className="textMuted textSm mb1 inlineBlock">
            ← Back to Monitoring Dashboard
          </Link>
          <h1>{monitor.website.name}</h1>
          <p className="textMuted">{monitor.website.url}</p>
        </div>
        <div className="btnGroup">
          <Button
            variant="primary"
            isLoading={runMutation.isPending}
            onClick={() => runMutation.mutate()}
          >
            ⚡ Run Diagnostic Scan Now
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="authSuccessMessage mb4">
          <p>{actionMessage}</p>
        </div>
      )}

      {/* Top Scores & Metrics */}
      <div className="metricsGrid mb4">
        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Overall Health Score</span>
            <Badge variant={scores.overall >= 80 ? 'success' : scores.overall >= 50 ? 'medium' : 'critical'}>
              {scores.overall}/100
            </Badge>
          </div>
          <div className="metricValue mt2">{scores.overall}</div>
          <p className="textSm mt1">
            {deltas.overall > 0 ? `+${deltas.overall} vs baseline` : deltas.overall < 0 ? `${deltas.overall} regression` : 'Stable baseline'}
          </p>
        </Card>

        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Availability & TLS</span>
            <Badge variant={latestRun?.tlsValid ? 'success' : 'critical'}>
              {latestRun?.httpStatus ? `HTTP ${latestRun.httpStatus}` : 'Unavailable'}
            </Badge>
          </div>
          <div className="metricValue mt2">
            {latestRun?.responseTimeMs ? `${latestRun.responseTimeMs} ms` : '—'}
          </div>
          <p className="textSm mt1">TLS Certificate: {latestRun?.tlsValid ? 'Valid' : 'Expired/Invalid'}</p>
        </Card>

        <Card>
          <div className="cardHeaderFlex">
            <span className="metricLabel">Pillar Health</span>
            <Badge variant="neutral">Diagnostic Scan</Badge>
          </div>
          <div className="pillarHealthList mt2">
            <div className="textSm">Lead: <strong>{scores.lead}/100</strong></div>
            <div className="textSm">Ads: <strong>{scores.advertising}/100</strong></div>
            <div className="textSm">SEO: <strong>{scores.seo}/100</strong></div>
            <div className="textSm">Security: <strong>{scores.security}/100</strong></div>
          </div>
        </Card>
      </div>

      {/* Active Alerts */}
      <h2 className="mb3">Active & Historical Alerts</h2>
      <Card className="tableCard mb4">
        {(!monitor.alerts || monitor.alerts.length === 0) ? (
          <div className="emptyState">No active alerts detected. All monitoring checks passing.</div>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Alert Title</th>
                <th>Details</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {monitor.alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <Badge variant={alert.severity === 'CRITICAL' ? 'critical' : 'high'}>
                      {alert.severity}
                    </Badge>
                  </td>
                  <td><strong>{alert.title}</strong></td>
                  <td>{alert.message}</td>
                  <td>
                    <Badge variant={alert.status === 'OPEN' ? 'critical' : alert.status === 'RESOLVED' ? 'success' : 'neutral'}>
                      {alert.status}
                    </Badge>
                  </td>
                  <td>
                    {alert.status === 'OPEN' && (
                      <Button
                        variant="outline"
                        size="sm"
                        isLoading={ackMutation.isPending && ackMutation.variables === alert.id}
                        onClick={() => ackMutation.mutate(alert.id)}
                      >
                        Acknowledge
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Regressions & Detected Changes */}
      <h2 className="mb3">Detected Changes & Regressions</h2>
      <Card className="tableCard mb4">
        {(!monitor.findings || monitor.findings.length === 0) ? (
          <div className="emptyState">No regressions detected between scans.</div>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Change Type</th>
                <th>Category</th>
                <th>Issue Title</th>
                <th>Severity</th>
                <th>Detected At</th>
              </tr>
            </thead>
            <tbody>
              {monitor.findings.map((finding) => (
                <tr key={finding.id}>
                  <td>
                    <Badge
                      variant={
                        finding.changeType === 'RESOLVED'
                          ? 'success'
                          : finding.changeType === 'REGRESSED'
                            ? 'critical'
                            : 'neutral'
                      }
                    >
                      {finding.changeType}
                    </Badge>
                  </td>
                  <td>{finding.category}</td>
                  <td>
                    <strong>{finding.title}</strong>
                    <div className="textMuted textSm">{finding.description}</div>
                  </td>
                  <td>
                    <Badge variant={finding.severity === 'CRITICAL' ? 'critical' : finding.severity === 'HIGH' ? 'high' : 'medium'}>
                      {finding.severity}
                    </Badge>
                  </td>
                  <td>{new Date(finding.detectedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Execution History */}
      <h2 className="mb3">Monitoring Execution History</h2>
      <Card className="tableCard">
        {(!monitor.runs || monitor.runs.length === 0) ? (
          <div className="emptyState">No execution history recorded yet.</div>
        ) : (
          <table className="dataTable">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Status</th>
                <th>HTTP Status</th>
                <th>Response Time</th>
                <th>Score</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {monitor.runs.map((run) => (
                <tr key={run.id}>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                  <td>
                    <Badge variant={run.status === 'COMPLETED' ? 'success' : run.status === 'PARTIAL' ? 'medium' : 'critical'}>
                      {run.status}
                    </Badge>
                  </td>
                  <td>{run.httpStatus ? `HTTP ${run.httpStatus}` : '—'}</td>
                  <td>{run.responseTimeMs ? `${run.responseTimeMs} ms` : '—'}</td>
                  <td><strong>{run.scores?.overall ?? '—'}</strong></td>
                  <td>{run.findingsCount} issues ({run.newRegressionsCount} new)</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
