import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  getMonitors,
  createMonitor,
  triggerManualRun,
  type MonitoringConfig,
} from '../../api/monitoring.js';
import { getWebsites, type Website } from '../../api/websites.js';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { Modal } from '../../components/ui/Modal.js';
import { Skeleton, ErrorState, EmptyState } from '../../components/ui/States.js';

export function MonitoringView() {
  const queryClient = useQueryClient();
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [selectedFrequency, setSelectedFrequency] = useState<
    'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY'
  >('HOURLY');
  const [maxPages, setMaxPages] = useState(10);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const {
    data: monitors,
    isLoading: loadingMonitors,
    error: monitorError,
  } = useQuery<MonitoringConfig[]>({
    queryKey: ['monitors-list'],
    queryFn: getMonitors,
  });

  const { data: websites } = useQuery<Website[]>({
    queryKey: ['websites-list'],
    queryFn: getWebsites,
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      createMonitor({
        websiteId: selectedWebsiteId,
        frequency: selectedFrequency,
        maxPages,
      }),
    onSuccess: () => {
      setEnrollModalOpen(false);
      setActionMessage('Website enrolled in Watchdog continuous multi-page monitoring.');
      queryClient.invalidateQueries({ queryKey: ['monitors-list'] });
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Enrollment failed');
    },
  });

  const manualRunMutation = useMutation({
    mutationFn: (id: string) => triggerManualRun(id),
    onSuccess: (data) => {
      setActionMessage(data.message || 'Watchdog monitoring scan enqueued.');
      queryClient.invalidateQueries({ queryKey: ['monitors-list'] });
    },
    onError: (err: unknown) => {
      setActionMessage(err instanceof Error ? err.message : 'Manual scan failed');
    },
  });

  if (loadingMonitors) {
    return (
      <div className="pageContainer">
        <Skeleton height="60px" className="mb4" />
        <Skeleton height="200px" className="mb4" />
        <Skeleton height="350px" />
      </div>
    );
  }

  if (monitorError) {
    return (
      <div className="pageContainer">
        <ErrorState message="Failed to load Watchdog monitoring configurations." />
      </div>
    );
  }

  const activeMonitors = (monitors || []).filter((m) => m.enabled && !m.archivedAt);
  const openAlertsCount = (monitors || []).reduce(
    (acc, m) => acc + (m.alerts?.length || 0),
    0
  );

  return (
    <div className="pageContainer">
      <div className="pageHeader">
        <div>
          <h1>Watchdog Continuous Monitoring</h1>
          <p>Autonomous 24/7 multi-page lead leak detection, health checks, and change monitoring.</p>
        </div>
        <div>
          <Button variant="primary" onClick={() => setEnrollModalOpen(true)}>
            + Enroll Website
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="authSuccessMessage mb4">
          <p>{actionMessage}</p>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="metricsGrid mb4">
        <Card>
          <span className="metricLabel">Active Monitors</span>
          <div className="metricValue mt2">{activeMonitors.length}</div>
          <p className="textMuted textSm mt1">Bounded multi-page targets</p>
        </Card>

        <Card>
          <span className="metricLabel">Health Status</span>
          <div className="metricValue mt2">
            <Badge variant={openAlertsCount === 0 ? 'success' : 'critical'}>
              {openAlertsCount === 0 ? 'All Systems Healthy' : `${openAlertsCount} Active Incident(s)`}
            </Badge>
          </div>
          <p className="textMuted textSm mt1">Automated regression tracking</p>
        </Card>

        <Card>
          <span className="metricLabel">Distributed Scheduler</span>
          <div className="metricValue mt2">Atomic Lock</div>
          <p className="textMuted textSm mt1">Zero duplicate execution guarantee</p>
        </Card>
      </div>

      {/* Monitors List */}
      <h2 className="mb3">Monitored Web Properties</h2>
      {(!monitors || monitors.length === 0) ? (
        <Card>
          <EmptyState
            title="No Websites Monitored Yet"
            description="Enroll your first website into Watchdog 24/7 to begin continuous regression and conversion leakage tracking."
            actionText="Enroll Website"
            onAction={() => setEnrollModalOpen(true)}
          />
        </Card>
      ) : (
        <div className="monitorsList">
          {monitors.map((mon) => {
            const latestRun = mon.runs?.[0];
            const score = latestRun?.scores?.overall ?? 0;
            const openAlerts = mon.alerts?.length || 0;

            return (
              <Card key={mon.id} className="monitorCard mb3">
                <div className="cardHeaderFlex">
                  <div>
                    <Link to={`/monitoring/${mon.id}`} className="monitorSiteTitle">
                      <strong>{mon.website.name}</strong>
                    </Link>
                    <span className="textMuted textSm ml2">({mon.website.domain})</span>
                  </div>
                  <div className="badgeRow">
                    <Badge variant="neutral">{mon.frequency.replace('_', ' ')}</Badge>
                    <Badge variant="neutral">{mon.maxPages || 10} Pages</Badge>
                    <Badge variant={openAlerts === 0 ? 'success' : 'critical'}>
                      {openAlerts === 0 ? 'HEALTHY' : `${openAlerts} ALERT(S)`}
                    </Badge>
                  </div>
                </div>

                <div className="monitorDetailsGrid mt3">
                  <div>
                    <span className="textMuted textSm">Overall Health Score</span>
                    <div className="textLg fontBold mt1">{score > 0 ? `${score}/100` : '—'}</div>
                  </div>
                  <div>
                    <span className="textMuted textSm">Pages Monitored</span>
                    <div className="textSm mt1">{latestRun?.pagesEvaluated ?? 1} pages</div>
                  </div>
                  <div>
                    <span className="textMuted textSm">Last Checked</span>
                    <div className="textSm mt1">
                      {mon.lastRunAt ? new Date(mon.lastRunAt).toLocaleTimeString() : 'Pending'}
                    </div>
                  </div>
                  <div>
                    <span className="textMuted textSm">Response Time</span>
                    <div className="textSm mt1">
                      {latestRun?.responseTimeMs ? `${latestRun.responseTimeMs} ms` : '—'}
                    </div>
                  </div>
                </div>

                <div className="cardActionsFlex mt4">
                  <Link to={`/monitoring/${mon.id}`}>
                    <Button variant="outline" size="sm">
                      View Health & Regressions
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={manualRunMutation.isPending && manualRunMutation.variables === mon.id}
                    onClick={() => manualRunMutation.mutate(mon.id)}
                  >
                    Run Now
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Enroll Modal */}
      {enrollModalOpen && (
        <Modal
          isOpen={enrollModalOpen}
          title="Enroll Website in Watchdog Continuous Monitoring"
          onClose={() => setEnrollModalOpen(false)}
        >
          <div className="formGroup mb3">
            <label htmlFor="websiteSelect">Select Website</label>
            <select
              id="websiteSelect"
              className="formControl"
              value={selectedWebsiteId}
              onChange={(e) => setSelectedWebsiteId(e.target.value)}
            >
              <option value="">-- Choose a Website --</option>
              {(websites || []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.domain})
                </option>
              ))}
            </select>
          </div>

          <div className="formGroup mb3">
            <label htmlFor="frequencySelect">Monitoring Frequency</label>
            <select
              id="frequencySelect"
              className="formControl"
              value={selectedFrequency}
              onChange={(e) => setSelectedFrequency(e.target.value as any)}
            >
              <option value="HOURLY">Hourly (Recommended for Pro)</option>
              <option value="FIFTEEN_MINUTES">Every 15 Minutes (Pro / Agency)</option>
              <option value="FIVE_MINUTES">Every 5 Minutes (Agency High Priority)</option>
              <option value="DAILY">Daily</option>
            </select>
          </div>

          <div className="formGroup mb4">
            <label htmlFor="maxPagesSelect">Crawl Page Depth & Limit</label>
            <select
              id="maxPagesSelect"
              className="formControl"
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
            >
              <option value={5}>5 Bounded Pages</option>
              <option value={10}>10 Bounded Pages (Standard)</option>
              <option value={25}>25 Bounded Pages (Deep)</option>
            </select>
          </div>

          <div className="modalActions">
            <Button variant="ghost" onClick={() => setEnrollModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedWebsiteId}
              isLoading={enrollMutation.isPending}
              onClick={() => enrollMutation.mutate()}
            >
              Start Monitoring
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
