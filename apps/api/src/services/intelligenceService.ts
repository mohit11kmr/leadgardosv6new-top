import { db } from '@leadguard/database';
import {
  analyzeWhatsAppOptimization,
  buildRevenueScenarios,
  explainScores,
  simulateFunnelLeakage,
  type Finding,
  type ImpactInputs,
  type PageRecord,
} from '@leadguard/shared';

export class IntelligenceService {
  async getScoreExplanation(auditId: string, organizationId: string) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: { score: true, findings: true },
    });
    if (!audit) return null;

    const findings = (audit.findings ?? []) as unknown as Finding[];
    const explanation = explainScores(findings, audit.scoringVersion || 'v3');
    return {
      overall: explanation.overall,
      scoringVersion: audit.scoringVersion || 'v3',
      score: audit.score,
      pillars: {
        lead: explanation.lead,
        advertising: explanation.advertising,
        seo: explanation.seo,
        security: explanation.security,
      },
    };
  }

  async getBusinessImpact(auditId: string, organizationId: string) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      select: { businessImpact: true },
    });
    if (!audit) return null;
    return audit.businessImpact;
  }

  async getExecutiveSummary(auditId: string, organizationId: string) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      select: { executiveSummary: true },
    });
    if (!audit) return null;
    return audit.executiveSummary;
  }

  async getRevenueScenarios(auditId: string, organizationId: string, customInputs?: Partial<ImpactInputs>) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: { findings: true, website: true },
    });
    if (!audit) return null;

    const findings = (audit.findings ?? []) as unknown as Finding[];
    return buildRevenueScenarios(findings, customInputs);
  }

  async getFunnelSimulation(auditId: string, organizationId: string, customInputs?: Partial<ImpactInputs>) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: { findings: true, website: true },
    });
    if (!audit) return null;

    const findings = (audit.findings ?? []) as unknown as Finding[];
    return simulateFunnelLeakage(findings, customInputs);
  }

  async getWhatsAppOptimization(auditId: string, organizationId: string) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: {
        findings: true,
        pages: {
          take: 1,
          orderBy: { depth: 'asc' },
        },
      },
    });
    if (!audit) return null;

    const firstPage = (audit.pages[0] as unknown as PageRecord) || undefined;
    const findings = (audit.findings ?? []) as unknown as Finding[];
    return analyzeWhatsAppOptimization(firstPage, findings);
  }
}

export const intelligenceService = new IntelligenceService();
