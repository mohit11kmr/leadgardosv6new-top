import { apiClient, ApiError, accessTokenKey } from './client.js';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type VaultRunMode = 'STANDARD' | 'RETEST';

export type VaultRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type VaultFindingStatus =
  | 'OPEN'
  | 'TRIAGED'
  | 'FIXED'
  | 'VERIFIED'
  | 'VERIFIED_IGNORED';

export interface VaultAuditRun {
  id: string;
  organizationId: string;
  websiteId: string;
  auditId: string | null;
  mode: VaultRunMode;
  status: VaultRunStatus;
  idempotencyKey: string | null;
  triggerSource: string;
  triggeredBy: string | null;
  pagesDiscovered: number;
  pagesFetched: number;
  pagesFailed: number;
  findingsCount: number;
  score: number;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  cancelledAt: string | null;
  retestedFindings: number;
  fixedFindings: number;
  createdAt: string;
  findings?: VaultAuditFinding[];
}

export interface VaultAuditFinding {
  id: string;
  auditId: string | null;
  runId: string | null;
  websiteId: string;
  scannerKey: string;
  normalizedIssueKey: string;
  severity: Severity;
  title: string;
  description: string;
  status: VaultFindingStatus;
  evidence: Record<string, unknown> | null;
  affectedUrl: string | null;
  recommendation: string;
  scoreImpact: number;
  cwe: string | null;
  cvssVector: string | null;
  cvssScore: number | null;
  ignoreReason: string | null;
  ignoredById: string | null;
  ignoredAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SecurityReport {
  id: string;
  organizationId: string;
  title: string;
  status: string;
  reportType: string;
  snapshotData: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedFindings {
  data: VaultAuditFinding[];
  meta: { total: number; page: number; limit: number };
}

export interface TriggerRunInput {
  mode?: VaultRunMode;
  idempotencyKey?: string;
  maxPages?: number;
  maxDepth?: number;
}

export async function getVaultRuns(
  websiteId: string,
  params?: { limit?: number }
): Promise<VaultAuditRun[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : '';
  return apiClient<VaultAuditRun[]>(`/websites/${websiteId}/security-audit${queryString}`);
}

export async function getVaultRun(
  websiteId: string,
  runId: string
): Promise<VaultAuditRun> {
  return apiClient<VaultAuditRun>(`/websites/${websiteId}/security-audit/${runId}`);
}

export async function triggerVaultRun(
  websiteId: string,
  input: TriggerRunInput = {}
): Promise<VaultAuditRun> {
  return apiClient<VaultAuditRun>(`/websites/${websiteId}/security-audit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function retestVaultRun(
  websiteId: string,
  runId: string
): Promise<VaultAuditRun> {
  return apiClient<VaultAuditRun>(
    `/websites/${websiteId}/security-audit/${runId}/retest`,
    { method: 'POST' }
  );
}

export async function getVaultFindings(
  websiteId: string,
  runId: string,
  params?: { status?: VaultFindingStatus; page?: number; limit?: number }
): Promise<PaginatedFindings> {
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : '';
  const url = `${baseUrl}/websites/${websiteId}/security-audit/${runId}/findings${queryString}`;
  const token = localStorage.getItem(accessTokenKey);
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error?.message ?? 'Request failed',
      body.error?.code ?? 'API_ERROR',
      res.status,
      body.error?.requestId
    );
  }
  const body = await res.json();
  return { data: body.data as VaultAuditFinding[], meta: body.meta as PaginatedFindings['meta'] };
}

export async function updateVaultFinding(
  websiteId: string,
  runId: string,
  findingId: string,
  input: { status?: 'TRIAGED' | 'VERIFIED_IGNORED'; ignoreReason?: string }
): Promise<VaultAuditFinding> {
  return apiClient<VaultAuditFinding>(
    `/websites/${websiteId}/security-audit/${runId}/findings/${findingId}`,
    { method: 'PATCH', body: JSON.stringify(input) }
  );
}

export async function getVaultFindingEvidence(
  websiteId: string,
  runId: string,
  findingId: string
): Promise<{ evidence: Record<string, unknown> | null; affectedUrl: string | null }> {
  return apiClient(
    `/websites/${websiteId}/security-audit/${runId}/findings/${findingId}/evidence`
  );
}

export async function generateVaultReport(
  websiteId: string,
  runId: string,
  input: { title?: string; clientWorkspaceId?: string; templateVersion?: string } = {}
): Promise<SecurityReport> {
  return apiClient<SecurityReport>(
    `/websites/${websiteId}/security-audit/${runId}/report`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function getVaultReport(
  websiteId: string,
  runId: string
): Promise<SecurityReport> {
  return apiClient<SecurityReport>(
    `/websites/${websiteId}/security-audit/${runId}/report`
  );
}

export async function createReportShareLink(
  reportId: string,
  input: { password?: string; expiresInDays?: number } = {}
): Promise<{ shareLink: Record<string, unknown>; rawToken: string }> {
  return apiClient<{ shareLink: Record<string, unknown>; rawToken: string }>(
    `/reports/${reportId}/share`,
    { method: 'POST', body: JSON.stringify(input) }
  );
}

export async function enqueueReportPdf(
  reportId: string
): Promise<Record<string, unknown>> {
  return apiClient<Record<string, unknown>>(`/reports/${reportId}/pdf`, {
    method: 'POST',
  });
}

