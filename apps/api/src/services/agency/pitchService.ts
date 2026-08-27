import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from '../entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const pitchQueue = new Queue('agency-pitch', { connection });

export interface ClaimReference {
  findingId?: string;
  featureId?: string;
  category?: string;
  claim: string;
}

export interface GroundedPitchContext {
  domain: string;
  businessName?: string | null;
  industry?: string | null;
  leadScore: number;
  criticalFindingsCount: number;
  highFindingsCount: number;
  verifiedFindings: Array<{
    id: string;
    title: string;
    category: string;
    severity: string;
    featureId?: string;
  }>;
  potentialOpportunity?: string | null;
  tone: string;
  language: string;
}

export interface AIProviderResult {
  subject: string;
  opening: string;
  problem: string;
  businessImpact: string;
  recommendation: string;
  callToAction: string;
  content: string;
  tokensUsed: number;
  estimatedCost: number;
  provider: string;
  model: string;
  generationType: 'DETERMINISTIC_TEMPLATE' | 'REAL_AI';
  claimReferences: ClaimReference[];
}

export interface AIProvider {
  readonly providerName: string;
  readonly modelName: string;
  generatePitch(context: GroundedPitchContext): Promise<AIProviderResult>;
}

export class TemplateAIProvider implements AIProvider {
  readonly providerName = 'DETERMINISTIC_TEMPLATE';
  readonly modelName = 'template-v1';

  async generatePitch(context: GroundedPitchContext): Promise<AIProviderResult> {
    const name = context.businessName || context.domain;
    const claimReferences: ClaimReference[] = [];

    let issuesText: string;
    if (context.verifiedFindings.length > 0) {
      const topFindings = context.verifiedFindings.slice(0, 3);
      issuesText = topFindings.map((f) => f.title).join(', ');
      for (const f of topFindings) {
        claimReferences.push({
          findingId: f.id,
          featureId: f.featureId,
          category: f.category,
          claim: `Identified issue: ${f.title}`,
        });
      }
    } else {
      issuesText = 'overall conversion optimization opportunities';
      claimReferences.push({
        claim: `Diagnostic evaluation score: ${context.leadScore}/100`,
      });
    }

    const subject = `Quick question regarding ${context.domain}'s lead conversion (Score: ${context.leadScore}/100)`;
    const opening = `Hi ${name} team,\n\nI was reviewing ${context.domain} and noticed conversion bottlenecks that may impact your inbound lead capture rate.`;
    const problem = `During our automated diagnostic audit, we verified ${context.criticalFindingsCount} critical and ${context.highFindingsCount} high-priority items, specifically: ${issuesText}.`;
    const businessImpact = `Based on LeadGuard's diagnostic analysis, these factors contribute to an overall conversion readiness score of ${context.leadScore}/100.`;
    const recommendation = `Remediating these verified bottlenecks will remove conversion friction for prospective customers visiting ${context.domain}.`;
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
      estimatedCost: 0.0,
      provider: this.providerName,
      model: this.modelName,
      generationType: 'DETERMINISTIC_TEMPLATE',
      claimReferences,
    };
  }
}

export class GeminiProvider implements AIProvider {
  readonly providerName = 'GEMINI';
  readonly modelName: string;
  private apiKey?: string;

  constructor(modelName = 'gemini-1.5-flash', apiKey?: string) {
    this.modelName = modelName;
    this.apiKey = apiKey !== undefined ? apiKey : process.env.GEMINI_API_KEY;
    if (this.apiKey === 'MY_GEMINI_API_KEY' || !this.apiKey) {
      this.apiKey = undefined;
    }
  }

  async generatePitch(context: GroundedPitchContext): Promise<AIProviderResult> {
    if (!this.apiKey || this.apiKey === 'MY_GEMINI_API_KEY' || !this.apiKey.startsWith('AIza')) {
      const err = new Error('Gemini API key is not configured');
      (err as unknown as { code: string }).code = 'AI_PROVIDER_NOT_CONFIGURED';
      throw err;
    }

    const prompt = `You are a professional B2B conversion optimization strategist writing a cold outreach email.
CRITICAL GROUNDING RULES:
1. ONLY reference verified audit findings provided below. DO NOT invent revenue loss numbers, employee counts, company history, or unverified findings.
2. Maintain a ${context.tone} tone in ${context.language}.

TARGET SITE CONTEXT:
- Domain: ${context.domain}
- Business Name: ${context.businessName || context.domain}
- Industry: ${context.industry || 'Business'}
- Lead Conversion Score: ${context.leadScore}/100
- Critical Findings Count: ${context.criticalFindingsCount}
- High Findings Count: ${context.highFindingsCount}
- Verified Findings: ${JSON.stringify(context.verifiedFindings.map((f) => ({ title: f.title, category: f.category, severity: f.severity })))}

Respond with a JSON object strictly containing:
{
  "subject": "Email subject",
  "opening": "Opening paragraph",
  "problem": "Problem explanation strictly referencing verified findings",
  "businessImpact": "Grounded business impact based strictly on lead score ${context.leadScore}/100",
  "recommendation": "Technical recommendation",
  "callToAction": "Clear low-friction CTA"
}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API returned status ${res.status}`);
      }

      const body = await res.json() as any;
      const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Empty response from Gemini provider');
      }

      const parsed = JSON.parse(rawText);
      if (!parsed.subject || !parsed.opening || !parsed.problem || !parsed.businessImpact || !parsed.recommendation || !parsed.callToAction) {
        const err = new Error('Invalid AI response structure');
        (err as unknown as { code: string }).code = 'INVALID_AI_RESPONSE';
        throw err;
      }

      const claimReferences: ClaimReference[] = context.verifiedFindings.map((f) => ({
        findingId: f.id,
        featureId: f.featureId,
        category: f.category,
        claim: f.title,
      }));

      const content = `${parsed.subject}\n\n${parsed.opening}\n\n${parsed.problem}\n\n${parsed.businessImpact}\n\n${parsed.recommendation}\n\n${parsed.callToAction}`;

      return {
        subject: parsed.subject,
        opening: parsed.opening,
        problem: parsed.problem,
        businessImpact: parsed.businessImpact,
        recommendation: parsed.recommendation,
        callToAction: parsed.callToAction,
        content,
        tokensUsed: body.usageMetadata?.totalTokenCount || 350,
        estimatedCost: 0.0005,
        provider: this.providerName,
        model: this.modelName,
        generationType: 'REAL_AI',
        claimReferences,
      };
    } catch (err: any) {
      if (err.code === 'AI_PROVIDER_NOT_CONFIGURED' || err.code === 'INVALID_AI_RESPONSE') {
        throw err;
      }
      const wrapped = new Error(err.message || 'Failed to generate AI pitch');
      (wrapped as unknown as { code: string }).code = 'AI_GENERATION_FAILED';
      throw wrapped;
    }
  }
}

export class PitchService {
  private aiProvider: AIProvider;

  constructor(aiProvider?: AIProvider) {
    if (aiProvider) {
      this.aiProvider = aiProvider;
    } else if (process.env.AI_PROVIDER === 'GEMINI') {
      this.aiProvider = new GeminiProvider('gemini-2.5-flash', process.env.GEMINI_API_KEY);
    } else {
      this.aiProvider = new TemplateAIProvider();
    }
  }

  setProvider(provider: AIProvider) {
    this.aiProvider = provider;
  }

  getProvider(): AIProvider {
    return this.aiProvider;
  }

  async enqueuePitchGeneration(
    organizationId: string,
    prospectId: string,
    options: {
      tone?: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
      language?: string;
      idempotencyKey?: string;
    } = {}
  ) {
    // 1. Entitlement check
    const entitlement = await entitlementService.canGeneratePitch(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 2. Fetch prospect & check existence
    const prospect = await db.prospect.findFirst({
      where: { id: prospectId, organizationId },
    });
    if (!prospect) {
      const err = new Error('Prospect not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    // 3. Check idempotency if key provided
    if (options.idempotencyKey) {
      const existing = await db.pitchGeneration.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId,
            idempotencyKey: options.idempotencyKey,
          },
        },
      });
      if (existing) {
        return {
          generationId: existing.id,
          status: existing.status,
          pitchId: existing.pitchId,
        };
      }
    }

    // 4. Create PitchGeneration record
    const generation = await db.pitchGeneration.create({
      data: {
        organizationId,
        prospectId,
        status: 'QUEUED',
        idempotencyKey: options.idempotencyKey || null,
      },
    });

    // 5. Enqueue BullMQ job
    await pitchQueue.add(
      'generate-pitch',
      {
        generationId: generation.id,
        organizationId,
        prospectId,
        tone: options.tone || 'PROFESSIONAL',
        language: options.language || 'en',
      },
      { jobId: `pitch_gen_${generation.id}` }
    );

    return {
      generationId: generation.id,
      status: 'QUEUED',
    };
  }

  async getGenerationStatus(organizationId: string, generationId: string) {
    const generation = await db.pitchGeneration.findFirst({
      where: { id: generationId, organizationId },
    });
    if (!generation) {
      const err = new Error('Pitch generation not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    let pitch = null;
    if (generation.pitchId) {
      pitch = await db.pitch.findUnique({ where: { id: generation.pitchId } });
    }

    return {
      generationId: generation.id,
      status: generation.status,
      error: generation.error,
      tokensUsed: generation.tokensUsed,
      estimatedCost: generation.estimatedCost,
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt,
      pitch,
    };
  }

  async processGenerationJob(jobData: {
    generationId: string;
    organizationId: string;
    prospectId: string;
    tone?: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
    language?: string;
  }) {
    const { generationId, organizationId, prospectId, tone, language } = jobData;

    const generation = await db.pitchGeneration.findUnique({
      where: { id: generationId },
    });
    if (!generation || generation.status === 'CANCELLED') {
      return { status: 'CANCELLED' };
    }

    await db.pitchGeneration.update({
      where: { id: generationId },
      data: { status: 'RUNNING' },
    });

    try {
      const prospect = await db.prospect.findFirst({
        where: { id: prospectId, organizationId },
        include: {
          audit: {
            include: {
              findings: true,
              score: true,
            },
          },
        },
      });

      if (!prospect) {
        throw new Error('Prospect not found');
      }

      // Hard Grounding Rule: Reject if there is no verified audit data or score
      if (prospect.leadScore === null && !prospect.audit?.score) {
        const err = new Error('No verified audit findings or diagnostic score available for this prospect');
        (err as unknown as { code: string }).code = 'NO_VERIFIED_FINDINGS';
        throw err;
      }

      const verifiedFindings = (prospect.audit?.findings || []).map((f) => ({
        id: f.id,
        title: f.title,
        category: f.category,
        severity: f.severity,
        featureId: f.internalKey || f.ruleId || undefined,
      }));

      const leadScore = prospect.leadScore ?? prospect.audit?.score?.overall ?? 70;
      const criticalCount = prospect.criticalFindings || verifiedFindings.filter((f) => f.severity === 'CRITICAL').length;
      const highCount = prospect.highFindings || verifiedFindings.filter((f) => f.severity === 'HIGH').length;

      const context: GroundedPitchContext = {
        domain: prospect.domain,
        businessName: prospect.businessName,
        industry: prospect.industry,
        leadScore,
        criticalFindingsCount: criticalCount,
        highFindingsCount: highCount,
        verifiedFindings,
        potentialOpportunity: prospect.potentialOpportunity,
        tone: tone || 'PROFESSIONAL',
        language: language || 'en',
      };

      const result = await this.aiProvider.generatePitch(context);

      // Determine next version for prospect pitch history
      const previousPitchesCount = await db.pitch.count({
        where: { prospectId, organizationId },
      });
      const version = previousPitchesCount + 1;

      const pitch = await db.pitch.create({
        data: {
          prospectId,
          organizationId,
          version,
          generationType: result.generationType,
          provider: result.provider,
          model: result.model,
          promptVersion: 'v1',
          language: language || 'en',
          tone: tone || 'PROFESSIONAL',
          subject: result.subject,
          opening: result.opening,
          problem: result.problem,
          businessImpact: result.businessImpact,
          recommendation: result.recommendation,
          callToAction: result.callToAction,
          content: result.content,
          claimReferences: result.claimReferences as object,
          tokensUsed: result.tokensUsed,
          estimatedCost: result.estimatedCost,
        },
      });

      await db.prospect.update({
        where: { id: prospectId },
        data: { status: 'QUALIFIED' },
      });

      await db.pitchGeneration.update({
        where: { id: generationId },
        data: {
          status: 'COMPLETED',
          pitchId: pitch.id,
          tokensUsed: result.tokensUsed,
          estimatedCost: result.estimatedCost,
        },
      });

      return { status: 'COMPLETED', pitchId: pitch.id };
    } catch (err: any) {
      await db.pitchGeneration.update({
        where: { id: generationId },
        data: {
          status: 'FAILED',
          error: err.message || 'Generation failed',
        },
      });
      throw err;
    }
  }

  async listPitches(organizationId: string, prospectId: string) {
    const prospect = await db.prospect.findFirst({
      where: { id: prospectId, organizationId },
    });
    if (!prospect) throw new Error('Prospect not found');

    return db.pitch.findMany({
      where: { prospectId, organizationId },
      orderBy: { version: 'desc' },
    });
  }
}

export const pitchService = new PitchService();
