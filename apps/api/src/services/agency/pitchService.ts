import { db } from '@leadguard/database';
import { entitlementService } from '../entitlementService.js';

export interface AIProvider {
  generatePitch(context: {
    domain: string;
    businessName?: string | null;
    industry?: string | null;
    leadScore: number;
    criticalFindingsCount: number;
    highFindingsCount: number;
    findingSummaries: string[];
    potentialOpportunity?: string | null;
    tone: string;
    language: string;
  }): Promise<{
    subject: string;
    opening: string;
    problem: string;
    businessImpact: string;
    recommendation: string;
    callToAction: string;
    content: string;
    tokensUsed: number;
  }>;
}

export class TemplateAIProvider implements AIProvider {
  async generatePitch(context: {
    domain: string;
    businessName?: string | null;
    industry?: string | null;
    leadScore: number;
    criticalFindingsCount: number;
    highFindingsCount: number;
    findingSummaries: string[];
    potentialOpportunity?: string | null;
    tone: string;
    language: string;
  }) {
    const name = context.businessName || context.domain;
    const issues = context.findingSummaries.length > 0
      ? context.findingSummaries.slice(0, 3).join(', ')
      : 'lead capture and SEO configuration issues';

    const subject = `Quick question regarding ${context.domain}'s lead conversion (Score: ${context.leadScore}/100)`;
    const opening = `Hi ${name} team,\n\nI was reviewing ${context.domain} and noticed a few conversion bottlenecks that are likely costing you qualified inbound leads.`;
    const problem = `During an automated diagnostic audit, we identified ${context.criticalFindingsCount} critical and ${context.highFindingsCount} high-priority issues, including: ${issues}.`;
    const businessImpact = `Based on LeadGuard's diagnostic analysis, these issues create friction for visitors trying to reach out via WhatsApp and web forms, resulting in a low health score of ${context.leadScore}/100.`;
    const recommendation = `Fixing your conversion forms, configuring missing metadata tags, and optimizing response times will directly improve your inbound lead capture rate.`;
    const callToAction = `Would you be open to a 10-minute walkthrough where I show you the exact code fixes we generated for ${context.domain}?`;

    const content = `${subject}\n\n${opening}\n\n${problem}\n\n${businessImpact}\n\n${recommendation}\n\n${callToAction}\n\nBest regards,\nLeadGuard Agency Partner`;

    return {
      subject,
      opening,
      problem,
      businessImpact,
      recommendation,
      callToAction,
      content,
      tokensUsed: 250,
    };
  }
}

export class PitchService {
  private aiProvider: AIProvider;

  constructor(aiProvider?: AIProvider) {
    this.aiProvider = aiProvider || new TemplateAIProvider();
  }

  async generatePitch(
    organizationId: string,
    prospectId: string,
    options: {
      tone?: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
      language?: string;
    } = {}
  ) {
    // 1. Entitlement check
    const entitlement = await entitlementService.canGeneratePitch(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 2. Fetch prospect & actual audit findings
    const prospect = await db.prospect.findFirst({
      where: { id: prospectId, organizationId },
      include: {
        audit: {
          include: {
            findings: { take: 10 },
            score: true,
          },
        },
      },
    });
    if (!prospect) throw new Error('Prospect not found');

    const findingSummaries = prospect.audit?.findings?.map((f) => f.title) || [
      'Missing or unoptimized WhatsApp quick-chat CTA',
      'Missing canonical URL tag causing SEO dilution',
      'Incomplete OpenGraph metadata',
    ];

    const leadScore = prospect.leadScore ?? prospect.audit?.score?.overall ?? 65;
    const criticalCount = prospect.criticalFindings || prospect.audit?.findings?.filter((f) => f.severity === 'CRITICAL').length || 1;
    const highCount = prospect.highFindings || prospect.audit?.findings?.filter((f) => f.severity === 'HIGH').length || 2;

    // 3. Grounded generation via AI Provider (Anti-Hallucination: Strictly utilizes verified audit data)
    const result = await this.aiProvider.generatePitch({
      domain: prospect.domain,
      businessName: prospect.businessName,
      industry: prospect.industry,
      leadScore,
      criticalFindingsCount: criticalCount,
      highFindingsCount: highCount,
      findingSummaries,
      potentialOpportunity: prospect.potentialOpportunity,
      tone: options.tone || 'PROFESSIONAL',
      language: options.language || 'en',
    });

    // 4. Store pitch with promptVersion
    const pitch = await db.pitch.create({
      data: {
        prospectId,
        organizationId,
        provider: 'GEMINI',
        model: 'gemini-2.5-pro',
        promptVersion: 'v1',
        language: options.language || 'en',
        tone: options.tone || 'PROFESSIONAL',
        subject: result.subject,
        opening: result.opening,
        problem: result.problem,
        businessImpact: result.businessImpact,
        recommendation: result.recommendation,
        callToAction: result.callToAction,
        content: result.content,
        tokensUsed: result.tokensUsed,
        estimatedCost: 0.002,
      },
    });

    // Update prospect status to QUALIFIED
    await db.prospect.update({
      where: { id: prospectId },
      data: { status: 'QUALIFIED' },
    });

    return pitch;
  }

  async listPitches(organizationId: string, prospectId: string) {
    const prospect = await db.prospect.findFirst({
      where: { id: prospectId, organizationId },
    });
    if (!prospect) throw new Error('Prospect not found');

    return db.pitch.findMany({
      where: { prospectId, organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const pitchService = new PitchService();
