import type {
  AuditTelemetry,
  BusinessImpact,
  ExecutiveSummary,
  Finding,
  ImpactInputs,
  PageRecord,
  ScoreBreakdown,
} from '@leadguard/shared';

export interface CrawlOptions {
  concurrencyLimit: number;
  maxPages: number;
  maxDepth: number;
  perRequestTimeoutMs: number;
  globalTimeoutMs: number;
  maxResponseBytes: number;
  countryMode?: 'IN' | 'GLOBAL';
}

export interface CrawlQueueItem {
  url: string;
  depth: number;
  parentUrl?: string;
}

export interface CrawlResult {
  pages: Map<string, PageRecord>;
  discoveredCount: number;
  fetchedCount: number;
  failedCount: number;
  lastErrorCode?: string;
  durationMs: number;
}

export interface AuditExecutionResult {
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  runId: string;
  pages: number;
  findings: number;
  scores?: ScoreBreakdown;
  impact?: BusinessImpact;
  summary?: ExecutiveSummary;
  telemetry?: AuditTelemetry;
  error?: string;
}

export interface FinalizationContext {
  auditId: string;
  runId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED';
  pages: PageRecord[];
  findings: Finding[];
  scores: ScoreBreakdown;
  impact: BusinessImpact;
  summary: ExecutiveSummary;
  telemetry: AuditTelemetry;
  errorCode?: string;
  startedAt: number;
}
