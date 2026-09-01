import { db } from '@leadguard/database';
import {
  analyzeWhatsAppOptimization,
  buildRevenueScenarios,
  explainScores,
  generateAutoFixScript,
  isManualFixRequired,
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

  /**
   * Auto-Fix Script Studio: copy-paste-able remediation snippets for
   * findings that are genuinely fixable via injectable client-side code
   * (tracking tags, WhatsApp CTA). Findings that require a server-side
   * change (security headers, TLS, broken routes) are reported separately
   * as "requires manual fix" rather than given a fake script.
   */
  async getAutoFixScripts(auditId: string, organizationId: string) {
    const audit = await db.audit.findFirst({
      where: { id: auditId, organizationId },
      include: { findings: true },
    });
    if (!audit) return null;

    const findings = (audit.findings ?? []) as unknown as Finding[];
    const scripts = findings
      .map((finding) => {
        const script = generateAutoFixScript(finding);
        if (!script) return null;
        return { findingId: finding.id, affectedUrl: finding.affectedUrl, ...script };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const manualFixRequired = findings
      .filter((finding) => isManualFixRequired(finding))
      .map((finding) => ({
        findingId: finding.id,
        internalKey: finding.internalKey,
        title: finding.title,
        affectedUrl: finding.affectedUrl,
        recommendation: finding.recommendation,
      }));

    return { scripts, manualFixRequired };
  }
}

export const intelligenceService = new IntelligenceService();
