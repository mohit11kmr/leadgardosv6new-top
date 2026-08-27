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
  ruleId: string;
  internalKey?: string;
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

export type ScoreAggregationPolicy = 'SITE_ONCE' | 'PAGE_BOUNDED' | 'PAGE_SUM';

export interface ScoreRule {
  ruleId: string;
  internalKey?: string;
  category: FindingCategory;
  defaultImpact: number;
  severity: Severity;
  aggregationPolicy: ScoreAggregationPolicy;
  maxPenalty?: number;
}

export interface ScannerContext {
  auditId: string;
  websiteUrl: string;
  countryMode?: 'IN' | 'GLOBAL';
  signal?: AbortSignal;
}

export interface ScannerDefinition {
  internalKey: string;
  featureId: string;
  name: string;
  category: FindingCategory;
  scope: FindingScope;
  severityPolicy: Severity;
  enabled: boolean;
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

export type ApiResponse<T> =
  | { success: true; data: T; meta?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string; requestId: string } };
