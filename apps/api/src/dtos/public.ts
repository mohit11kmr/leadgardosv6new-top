/**
 * Public Developer API Data Transfer Objects (DTOs)
 * Strict data minimization - excludes database internals, private notes, billing and secrets.
 */

export interface PublicWebsiteDTO {
  id: string;
  name: string;
  url: string;
  domain: string;
}

export interface PublicAuditScoreDTO {
  overall: number;
  lead: number;
  advertising: number;
  seo: number;
  security: number;
}

import type { JsonPrimitive, JsonValue, FindingEvidence } from '@leadguard/shared';

export type { JsonPrimitive, JsonValue, FindingEvidence };

export interface PublicAuditFindingDTO {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  scoreImpact: number;
  recommendation: string;
  businessImpact?: string | null;
  affectedUrl?: string | null;
  evidence?: FindingEvidence;
  normalizedIssueKey?: string;
}

export interface OpportunityLossEstimate {
  currency: string;
  amount: number;
  isEstimate: boolean;
  basis: string;
  assumptions: string[];
}

export interface PublicAuditDTO {
  id: string;
  website: PublicWebsiteDTO;
  status: string;
  score: PublicAuditScoreDTO | null;
  findings?: PublicAuditFindingDTO[];
  totalFindings: number;
  lockedFindingsCount: number;
  estimatedOpportunityLoss?: OpportunityLossEstimate | null;
  createdAt: string;
}

export interface PublicMonitorDTO {
  id: string;
  website: PublicWebsiteDTO;
  enabled: boolean;
  frequency: string;
  failureThreshold: number;
  responseTimeThresholdMs: number;
  createdAt: string;
}

export interface PublicMonitorRunDTO {
  id: string;
  status: string;
  durationMs: number | null;
  httpStatus: number | null;
  createdAt: string;
}

export interface PublicMonitorStatusDTO {
  monitor: PublicMonitorDTO;
  activeAlertsCount: number;
  latestRuns: PublicMonitorRunDTO[];
}

export interface PublicReportDTO {
  id: string;
  title: string;
  reportVersion: string;
  status: string;
  pdfStatus: string;
  snapshot: any;
  createdAt: string;
}

export interface PublicTestimonialDTO {
  id: string;
  authorName: string;
  companyName: string | null;
  role: string | null;
  content: string;
  rating: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasNextPage: boolean;
  hasMore: boolean;
  limit: number;
}
