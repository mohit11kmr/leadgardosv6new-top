import { apiClient } from './client.js';
import type { Score } from './audits.js';

export interface ScoreDeduction {
  ruleId: string;
  internalKey: string;
  title: string;
  penalty: number;
  occurrences: number;
  policy: 'ONCE_PER_AUDIT' | 'ONCE_PER_WEBSITE' | 'PER_PAGE' | 'BOUNDED_PER_PAGE';
}

export interface PillarScoreExplanation {
  pillar: 'lead' | 'advertising' | 'seo' | 'security';
  score: number;
  deductions: ScoreDeduction[];
  topRules: string[];
}

export interface ScoreExplanationResponse {
  overall: number;
  scoringVersion: string;
  score: Score;
  pillars: {
    lead: PillarScoreExplanation;
    advertising: PillarScoreExplanation;
    seo: PillarScoreExplanation;
    security: PillarScoreExplanation;
  };
}

export interface BusinessImpactResponse {
  kind: string;
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

export interface ExecutiveSummaryResponse {
  headline: string;
  overallScore: number;
  pillarScores: Score;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  topProblems: string[];
  priorityFixes: string[];
  businessImpact: BusinessImpactResponse;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RevenueScenario {
  slug: 'current' | 'conservative' | 'target';
  name: string;
  description: string;
  conversionRate: number;
  estimatedMonthlyLeads: number;
  estimatedMonthlyValue: number;
  recoveredLeadsPerMonth: number;
  recoveredValuePerMonth: number;
  changeVsCurrentPercent: number;
  assumptions: string[];
}

export interface RevenueScenariosResponse {
  currency: string;
  inputs: {
    monthlyVisitors: number;
    baselineConversionRate: number;
    averageLeadValue: number;
    source: 'USER' | 'DEFAULT';
  };
  observedConversionRisk: number;
  scenarios: RevenueScenario[];
}

export interface FunnelStage {
  stage: 'TRAFFIC' | 'LANDING' | 'ENGAGEMENT' | 'CONTACT_INTENT' | 'LEAD_CONVERSION';
  label: string;
  description: string;
  inflowVisitors: number;
  dropoffPercent: number;
  retainedVisitors: number;
  leakedVisitors: number;
  technicalFrictionPoints: string[];
  findingCount: number;
}

export interface FunnelSimulationResponse {
  trafficInput: number;
  baselineLeads: number;
  estimatedActualLeads: number;
  totalLeakedVisitors: number;
  stages: FunnelStage[];
  summary: string;
}

export interface WhatsAppQualityDimension {
  score: number;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_FIX';
  details: string;
  recommendations: string[];
}

export interface WhatsAppOptimizationResponse {
  overallScore: number;
  hasWhatsAppCta: boolean;
  detectedLinksCount: number;
  dimensions: {
    intentQuality: WhatsAppQualityDimension;
    ctaQuality: WhatsAppQualityDimension;
    phoneQuality: WhatsAppQualityDimension;
    mobileUsability: WhatsAppQualityDimension;
  };
  topRecommendations: string[];
  analyzedUrls: string[];
}

export async function getScoreExplanation(auditId: string): Promise<ScoreExplanationResponse> {
  return apiClient<ScoreExplanationResponse>(`/audits/${auditId}/score/explanation`);
}

export async function getBusinessImpact(auditId: string): Promise<BusinessImpactResponse> {
  return apiClient<BusinessImpactResponse>(`/audits/${auditId}/business-impact`);
}

export async function getExecutiveSummary(auditId: string): Promise<ExecutiveSummaryResponse> {
  return apiClient<ExecutiveSummaryResponse>(`/audits/${auditId}/summary`);
}

export async function getRevenueScenarios(
  auditId: string,
  inputs?: { monthlyVisitors?: number; conversionRate?: number; averageLeadValue?: number }
): Promise<RevenueScenariosResponse> {
  const params = new URLSearchParams();
  if (inputs?.monthlyVisitors) params.set('monthlyVisitors', String(inputs.monthlyVisitors));
  if (inputs?.conversionRate) params.set('conversionRate', String(inputs.conversionRate));
  if (inputs?.averageLeadValue) params.set('averageLeadValue', String(inputs.averageLeadValue));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiClient<RevenueScenariosResponse>(`/audits/${auditId}/scenarios${query}`);
}

export async function getFunnelSimulation(
  auditId: string,
  inputs?: { monthlyVisitors?: number; conversionRate?: number }
): Promise<FunnelSimulationResponse> {
  const params = new URLSearchParams();
  if (inputs?.monthlyVisitors) params.set('monthlyVisitors', String(inputs.monthlyVisitors));
  if (inputs?.conversionRate) params.set('conversionRate', String(inputs.conversionRate));
  const query = params.toString() ? `?${params.toString()}` : '';
  return apiClient<FunnelSimulationResponse>(`/audits/${auditId}/funnel${query}`);
}

export async function getWhatsAppOptimization(auditId: string): Promise<WhatsAppOptimizationResponse> {
  return apiClient<WhatsAppOptimizationResponse>(`/audits/${auditId}/whatsapp-optimizer`);
}
