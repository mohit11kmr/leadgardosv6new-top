export const roles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'AGENCY_ADMIN', 'AGENCY_MEMBER'] as const;
export type Role = (typeof roles)[number];

export const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof severities)[number];

export const findingCategories = ['LEAD', 'ADVERTISING', 'SEO', 'SECURITY'] as const;
export type FindingCategory = (typeof findingCategories)[number];

export const findingScopes = ['PAGE', 'WEBSITE', 'AUDIT'] as const;
export type FindingScope = (typeof findingScopes)[number];

export interface FindingEvidence {
  source: string;
  observed: string;
  location: string;
  why: string;
  recommendation: string;
  metadata?: Record<string, unknown>;
}

export interface Finding {
  id?: string;
  ruleId: string;
  internalKey?: string;
  normalizedIssueKey?: string;
  category: FindingCategory;
  scope: FindingScope;
  severity: Severity;
  title: string;
  description: string;
  evidence: FindingEvidence;
  affectedUrl?: string;
  recommendation: string;
  scoreImpact: number;
  businessImpact?: string;
  metadata?: Record<string, unknown>;
}

export interface PageRecord {
  url: string;
  finalUrl: string;
  statusCode: number;
  title?: string;
  contentType: string;
  headers: Record<string, string>;
  htmlAvailable: boolean;
  responseTimeMs: number;
  depth: number;
  parentUrl?: string;
  redirectChain: string[];
  html: string;
  errorCode?: string;
}

export interface ScoreBreakdown {
  lead: number;
  advertising: number;
  seo: number;
  security: number;
  overall: number;
}

export type ScoreAggregationPolicy =
  | 'ONCE_PER_AUDIT'
  | 'ONCE_PER_WEBSITE'
  | 'PER_PAGE'
  | 'BOUNDED_PER_PAGE'
  | 'SITE_ONCE'
  | 'PAGE_BOUNDED'
  | 'PAGE_SUM';

export interface ScoreRule {
  ruleId: string;
  internalKey?: string;
  normalizedIssueKey?: string;
  category: FindingCategory;
  defaultImpact: number;
  severity: Severity;
  aggregationPolicy: ScoreAggregationPolicy;
  maxPenalty?: number;
  enabled?: boolean;
  version?: string;
}

export interface ScoreDeduction {
  ruleId: string;
  internalKey?: string;
  normalizedIssueKey?: string;
  category: FindingCategory;
  scope: FindingScope;
  penalty: number;
  occurrences: number;
  policy: ScoreAggregationPolicy;
  reason: string;
}

export interface PillarScoreExplanation {
  score: number;
  deductions: ScoreDeduction[];
  topRules: string[];
}

export interface ScoreExplanation {
  version: string;
  overall: number;
  lead: PillarScoreExplanation;
  advertising: PillarScoreExplanation;
  seo: PillarScoreExplanation;
  security: PillarScoreExplanation;
}

export interface ScannerContext {
  auditId: string;
  websiteUrl: string;
  countryMode?: 'IN' | 'GLOBAL';
  signal?: AbortSignal;
}

export type ScannerStatus = 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

export interface ScannerResult {
  scannerKey: string;
  status: ScannerStatus;
  findings: Finding[];
  metrics?: Record<string, unknown>;
  error?: string;
}

export interface ScannerDefinition {
  internalKey: string;
  featureId: string;
  name: string;
  category: FindingCategory;
  scope: FindingScope;
  severityPolicy: Severity;
  version?: string;
  enabled: boolean;
}

export interface ScannerExecutableDefinition extends ScannerDefinition {
  version: string;
  run(page: PageRecord, context?: ScannerContext): Promise<ScannerResult> | ScannerResult;
}

export interface Scanner {
  readonly definition: ScannerDefinition;
  scan(page: PageRecord, context?: ScannerContext): Promise<Finding[]> | Finding[];
}

export interface ImpactInputs {
  monthlyVisitors: number;
  conversionRate: number;
  averageLeadValue: number;
  source?: 'USER' | 'DEFAULT';
}

export interface BusinessImpact {
  kind: 'POTENTIAL_OPPORTUNITY_LOSS';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  inputs: {
    monthlyVisitors: number;
    conversionRate: number;
    averageLeadValue: number;
    source: 'USER' | 'DEFAULT';
  };
  estimatedConversionRisk: number;
  estimatedLostOpportunities: number;
  estimatedOpportunityLoss: number;
  currency: string;
  assumptions: string[];
  methodology: string;
}

export interface ExecutiveSummary {
  headline: string;
  overallScore: number;
  pillarScores: ScoreBreakdown;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topProblems: string[];
  priorityFixes: string[];
  businessImpact: BusinessImpact;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
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

export type ApiResponse<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; requestId: string } };
