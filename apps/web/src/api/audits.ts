import { apiClient, ApiError, accessTokenKey } from './client.js';
import type { FindingEvidence } from '@leadguard/shared';

export interface Score {
  overall: number;
  lead: number;
  advertising: number;
  seo: number;
  security: number;
}

export type { FindingEvidence };

export interface Finding {
  id: string;
  ruleId: string;
  internalKey?: string;
  normalizedIssueKey?: string;
  category: 'LEAD' | 'ADVERTISING' | 'SEO' | 'SECURITY';
  scope: 'PAGE' | 'WEBSITE' | 'AUDIT';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  evidence: FindingEvidence;
  affectedUrl?: string;
  recommendation: string;
  scoreImpact: number;
  businessImpact?: string;
}

export interface AuditPage {
  id: string;
  auditId: string;
  url: string;
  finalUrl: string;
  statusCode?: number | null;
  title?: string | null;
  contentType?: string | null;
  htmlAvailable: boolean;
  responseTimeMs?: number | null;
  depth: number;
  parentUrl?: string | null;
  redirectChain?: string[];
  errorCode?: string | null;
  createdAt: string;
}

export interface AuditRun {
  id: string;
  auditId: string;
  status: string;
  pagesFetched: number;
  findingsCount: number;
  durationMs?: number | null;
  errorCode?: string | null;
  startedAt: string;
  completedAt?: string | null;
  createdAt: string;
}

export interface AuditTelemetry {
  queueWaitMs?: number;
  crawlDurationMs?: number;
  fetchDurationMs?: number;
  scanDurationMs?: number;
  aggregationDurationMs?: number;
  scoreDurationMs?: number;
  finalizationDurationMs?: number;
  totalDurationMs?: number;
  pagesDiscovered?: number;
  pagesFetched?: number;
  pagesFailed?: number;
  findingsGenerated?: number;
}

export interface Audit {
  id: string;
  organizationId: string;
  websiteId: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  progress: number;
  progressStage: string;
  pagesDiscovered?: number;
  pagesFetched?: number;
  pagesScanned?: number;
  findingsGenerated?: number;
  durationMs?: number | null;
  score?: Score | null;
  findings?: Finding[];
  businessImpact?: unknown;
  executiveSummary?: unknown;
  telemetry?: AuditTelemetry | null;
  createdAt: string;
  completedAt?: string | null;
  website?: { id: string; name: string; url: string; domain: string };
}

export interface FindingsFilterParams {
  category?: string;
  severity?: string;
  scope?: string;
  ruleId?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface PaginatedFindingsResponse {
  data: Finding[];
  meta: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    nextCursor?: string | null;
    previousCursor?: string | null;
  };
}

export async function startAudit(websiteId: string, idempotencyKey?: string): Promise<Audit> {
  return apiClient<Audit>('/audits', {
    method: 'POST',
    body: JSON.stringify({
      websiteId,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    }),
  });
}

export async function getAudits(limit = 25): Promise<Audit[]> {
  return apiClient<Audit[]>(`/audits?limit=${limit}`);
}

export async function getAudit(id: string): Promise<Audit> {
  return apiClient<Audit>(`/audits/${id}`);
}

export async function getAuditProgress(id: string): Promise<{ id: string; status: string; progress: number; progressStage: string }> {
  return apiClient<{ id: string; status: string; progress: number; progressStage: string }>(`/audits/${id}/progress`);
}

export async function getAuditFindings(id: string, filters: FindingsFilterParams = {}): Promise<PaginatedFindingsResponse> {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== 'ALL') params.set('category', filters.category);
  if (filters.severity && filters.severity !== 'ALL') params.set('severity', filters.severity);
  if (filters.scope && filters.scope !== 'ALL') params.set('scope', filters.scope);
  if (filters.ruleId) params.set('ruleId', filters.ruleId);
  if (filters.search) params.set('search', filters.search);
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.cursor) params.set('cursor', filters.cursor);

  const query = params.toString() ? `?${params.toString()}` : '';
  const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
  const token = localStorage.getItem(accessTokenKey);
  const res = await fetch(`${baseUrl}/audits/${id}/findings${query}`, {
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) {
    throw new ApiError(
      body.error?.message ?? 'Request failed',
      body.error?.code ?? 'API_ERROR',
      res.status,
      body.error?.requestId
    );
  }
  return { data: body.data as Finding[], meta: body.meta as PaginatedFindingsResponse['meta'] };
}

export async function getAuditPages(id: string): Promise<AuditPage[]> {
  return apiClient<AuditPage[]>(`/audits/${id}/pages`);
}

export async function getAuditRuns(id: string): Promise<AuditRun[]> {
  return apiClient<AuditRun[]>(`/audits/${id}/runs`);
}

export async function cancelAudit(id: string): Promise<{ cancelled: boolean }> {
  return apiClient<{ cancelled: boolean }>(`/audits/${id}/cancel`, {
    method: 'POST',
  });
}
