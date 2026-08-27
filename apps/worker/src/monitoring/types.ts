import type { Severity, FindingChangeType } from '@prisma/client';

export interface HealthCheckResult {
  isAvailable: boolean;
  httpStatus: number | null;
  responseTimeMs: number;
  tlsValid: boolean;
  tlsExpiresAt: Date | null;
  redirectChain: string[];
  contentType: string | null;
  html: string | null;
  error?: string;
}

export interface PageBaseline {
  normalizedUrl: string;
  title: string;
  statusCode: number;
  scores: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  };
  findingKeys: string[];
  signals: Record<string, unknown>;
}

export interface BaselineSnapshot {
  websiteId: string;
  capturedAt: string;
  scores: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  };
  pages: PageBaseline[];
  findingKeys: string[];
  signals: Record<string, unknown>;
}

export interface DetectedRegression {
  ruleId: string;
  category: string;
  severity: Severity;
  changeType: FindingChangeType;
  title: string;
  description: string;
  affectedUrl?: string;
  pageTitle?: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  evidence: Record<string, unknown>;
}

export interface AlertNotification {
  fingerprint: string;
  websiteId: string;
  organizationId: string;
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  affectedUrl?: string;
}
