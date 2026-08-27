import { apiClient } from './client.js';

export interface MonitoringConfig {
  id: string;
  organizationId: string;
  websiteId: string;
  enabled: boolean;
  frequency: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
  healthChecks: Record<string, unknown> | null;
  alertPolicy: Record<string, unknown> | null;
  baseline: Record<string, unknown> | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  website: {
    id: string;
    name: string;
    url: string;
    domain: string;
  };
  runs?: MonitoringRun[];
  findings?: MonitoringFinding[];
  alerts?: MonitoringAlert[];
}

export interface MonitoringRun {
  id: string;
  monitoringConfigId: string;
  websiteId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  httpStatus: number | null;
  responseTimeMs: number | null;
  tlsValid: boolean | null;
  scores: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  } | null;
  scoreDeltas: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  } | null;
  findingsCount: number;
  newRegressionsCount: number;
  resolvedCount: number;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface MonitoringFinding {
  id: string;
  ruleId: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  changeType: 'NEW' | 'RESOLVED' | 'PERSISTING' | 'REGRESSED' | 'UNCHANGED';
  title: string;
  description: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  evidence: Record<string, unknown> | null;
  detectedAt: string;
}

export interface MonitoringAlert {
  id: string;
  fingerprint: string;
  ruleId: string | null;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  message: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export async function getMonitors(): Promise<MonitoringConfig[]> {
  return apiClient<MonitoringConfig[]>('/monitoring');
}

export async function getMonitor(id: string): Promise<MonitoringConfig> {
  return apiClient<MonitoringConfig>(`/monitoring/${id}`);
}

export async function createMonitor(input: {
  websiteId: string;
  frequency?: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
}): Promise<MonitoringConfig> {
  return apiClient<MonitoringConfig>('/monitoring', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateMonitor(
  id: string,
  input: {
    enabled?: boolean;
    frequency?: 'FIVE_MINUTES' | 'FIFTEEN_MINUTES' | 'HOURLY' | 'DAILY';
  }
): Promise<MonitoringConfig> {
  return apiClient<MonitoringConfig>(`/monitoring/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteMonitor(id: string): Promise<void> {
  return apiClient<void>(`/monitoring/${id}`, {
    method: 'DELETE',
  });
}

export async function getMonitorRuns(id: string): Promise<MonitoringRun[]> {
  return apiClient<MonitoringRun[]>(`/monitoring/${id}/runs`);
}

export async function getMonitorFindings(id: string): Promise<MonitoringFinding[]> {
  return apiClient<MonitoringFinding[]>(`/monitoring/${id}/findings`);
}

export async function getMonitorAlerts(id: string): Promise<MonitoringAlert[]> {
  return apiClient<MonitoringAlert[]>(`/monitoring/${id}/alerts`);
}

export async function acknowledgeAlert(monitorId: string, alertId: string): Promise<MonitoringAlert> {
  return apiClient<MonitoringAlert>(`/monitoring/${monitorId}/alerts/${alertId}/ack`, {
    method: 'POST',
  });
}

export async function triggerManualRun(id: string): Promise<{ enqueued: boolean; jobId: string }> {
  return apiClient<{ enqueued: boolean; jobId: string }>(`/monitoring/${id}/run`, {
    method: 'POST',
  });
}
