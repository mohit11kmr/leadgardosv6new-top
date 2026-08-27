import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import {
  ClaimValidator,
  type ClaimReference,
  type VerifiedContext,
  type RawPitchOutput,
} from '@leadguard/shared';
import { entitlementService } from '../entitlementService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const pitchQueue = new Queue('agency-pitch', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

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
  assumptions?: string[];
  potentialOpportunity?: string | null;
  tone: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
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
  readonly modelName: string;

  constructor(modelName = 'template-v1') {
    this.modelName = process.env.AI_MODEL || modelName;
  }

  async generatePitch(context: GroundedPitchContext): Promise<AIProviderResult> {
    const name = context.businessName || context.domain;
    const hasFindings = context.verifiedFindings.length > 0;

    let subject: string;
    let opening: string;
    let problem: string;
    let businessImpact: string;
    let recommendation: string;
    let callToAction: string;

    if (hasFindings) {
      const topFindings = context.verifiedFindings.slice(0, 3);
      const issuesText = topFindings.map((f) => f.title).join(', ');

      subject = `Quick question regarding ${context.domain}'s lead conversion (Score: ${context.leadScore}/100)`;
      opening = `Hi ${name} team,\n\nI was reviewing ${context.domain} and noticed conversion bottlenecks that may impact your inbound lead capture rate.`;
      problem = `During our diagnostic evaluation, we verified ${context.criticalFindingsCount} critical and ${context.highFindingsCount} high-priority items, specifically: ${issuesText}.`;
      businessImpact = `Based on LeadGuard's diagnostic scoring, these factors contribute to an overall conversion readiness score of ${context.leadScore}/100.`;
      recommendation = `Remediating these verified bottlenecks will remove conversion friction for prospective customers visiting ${context.domain}.`;
      callToAction = `Would you be open to a 10-minute walkthrough where I show you the exact code fixes we generated for ${context.domain}?`;
    } else {
      // Neutral mode: never claim issues that don't exist
      subject = `Diagnostic evaluation regarding ${context.domain}'s lead performance (Score: ${context.leadScore}/100)`;
      opening = `Hi ${name} team,\n\nLeadGuard reviewed available diagnostic data for ${context.domain}.`;
      problem = `LeadGuard reviewed available diagnostic data.`;
      businessImpact = `Diagnostic conversion readiness score is ${context.leadScore}/100.`;
      recommendation = `Continuous health and diagnostic monitoring is recommended.`;
      callToAction = `Would you like us to share our full diagnostic checklist for ${context.domain}?`;
    }

    const validated = ClaimValidator.validateAndSanitize(
      { subject, opening, problem, businessImpact, recommendation, callToAction },
      context
    );

    return {
      subject: validated.sanitizedPitch.subject,
      opening: validated.sanitizedPitch.opening,
      problem: validated.sanitizedPitch.problem,
      businessImpact: validated.sanitizedPitch.businessImpact,
      recommendation: validated.sanitizedPitch.recommendation,
      callToAction: validated.sanitizedPitch.callToAction,
      content: validated.content,
      tokensUsed: 250,
      estimatedCost: 0.0,
      provider: this.providerName,
      model: this.modelName,
      generationType: 'DETERMINISTIC_TEMPLATE',
      claimReferences: validated.claimReferences,
    };
  }
}

export class GeminiProvider implements AIProvider {
  readonly providerName = 'GEMINI';
  readonly modelName: string;
  private apiKey?: string;

  constructor(modelName = 'gemini-1.5-flash', apiKey?: string) {
    this.modelName = process.env.AI_MODEL || modelName;
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
2. If no verified findings exist, adopt a neutral diagnostic posture without claiming specific flaws.
3. Maintain a ${context.tone} tone in ${context.language}.

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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
          signal: controller.signal,
        }
      );

      if (res.status === 429) {
        const err = new Error('AI rate limit exceeded');
        (err as unknown as { code: string }).code = 'AI_RATE_LIMITED';
        throw err;
      }

      if (res.status >= 500) {
        const err = new Error(`AI service temporary error (HTTP ${res.status})`);
        (err as unknown as { code: string }).code = 'AI_SERVICE_UNAVAILABLE';
        throw err;
      }

      if (!res.ok) {
        throw new Error(`Gemini API returned status ${res.status}`);
      }

      const bodyText = await res.text();
      if (bodyText.length > 100000) {
        throw new Error('AI response exceeded maximum payload limit');
      }

      const body = JSON.parse(bodyText);
      const rawText = body.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        throw new Error('Empty response from Gemini provider');
      }

      const parsed: RawPitchOutput = JSON.parse(rawText);
      if (!parsed.subject || !parsed.opening || !parsed.problem || !parsed.businessImpact || !parsed.recommendation || !parsed.callToAction) {
        const err = new Error('Invalid AI response structure');
        (err as unknown as { code: string }).code = 'INVALID_AI_RESPONSE';
        throw err;
      }

      const validated = ClaimValidator.validateAndSanitize(parsed, context);

      return {
        subject: validated.sanitizedPitch.subject,
        opening: validated.sanitizedPitch.opening,
        problem: validated.sanitizedPitch.problem,
        businessImpact: validated.sanitizedPitch.businessImpact,
        recommendation: validated.sanitizedPitch.recommendation,
        callToAction: validated.sanitizedPitch.callToAction,
        content: validated.content,
        tokensUsed: body.usageMetadata?.totalTokenCount || 350,
        estimatedCost: 0.0005,
        provider: this.providerName,
        model: this.modelName,
        generationType: 'REAL_AI',
        claimReferences: validated.claimReferences,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        const wrapped = new Error('AI request timed out after 15 seconds');
        (wrapped as unknown as { code: string }).code = 'AI_TIMEOUT';
        throw wrapped;
      }
      if (
        err.code === 'AI_PROVIDER_NOT_CONFIGURED' ||
        err.code === 'INVALID_AI_RESPONSE' ||
        err.code === 'AI_RATE_LIMITED' ||
        err.code === 'AI_SERVICE_UNAVAILABLE'
      ) {
        throw err;
      }
      const wrapped = new Error(err.message || 'Failed to generate AI pitch');
      (wrapped as unknown as { code: string }).code = 'AI_GENERATION_FAILED';
      throw wrapped;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class PitchService {
  private aiProvider: AIProvider;

  constructor() {
    if (process.env.AI_PROVIDER === 'GEMINI') {
      this.aiProvider = new GeminiProvider('gemini-1.5-flash', process.env.GEMINI_API_KEY);
    } else {
      this.aiProvider = new TemplateAIProvider();
    }
  }

  setProvider(provider: AIProvider) {
    this.aiProvider = provider;
  }

  async enqueuePitchGeneration(
    organizationId: string,
    prospectId: string,
    options: {
      tone?: 'PROFESSIONAL' | 'DIRECT' | 'CONSULTATIVE' | 'URGENT';
      language?: string;
      idempotencyKey?: string;
    } = {}
  ): Promise<{ generationId: string; status: string }> {
    // 1. Check Plan Quota
    const entitlement = await entitlementService.canGeneratePitch(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason || 'Pitch generation limit reached for your current subscription plan');
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    // 2. Validate prospect exists
    const prospect = await db.prospect.findFirst({
      where: { id: prospectId, organizationId },
    });
    if (!prospect) {
      const err = new Error('Prospect not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    // 3. Idempotency Check with Database Conflict Handling
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
        };
      }
    }

    let generation;
    try {
      generation = await db.pitchGeneration.create({
        data: {
          organizationId,
          prospectId,
          idempotencyKey: options.idempotencyKey || null,
          status: 'QUEUED',
        },
      });
    } catch (err: any) {
      // Catch concurrent unique constraint race on idempotencyKey
      if (err.code === 'P2002' && options.idempotencyKey) {
        const existing = await db.pitchGeneration.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId,
              idempotencyKey: options.idempotencyKey,
            },
          },
        });
        if (existing) {
          return { generationId: existing.id, status: existing.status };
        }
      }
      throw err;
    }

    // Enqueue to BullMQ worker
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

      // Hard Grounding Rule: Reject if there is zero verified audit data or score
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

      let provider: AIProvider;
      if (process.env.AI_PROVIDER === 'GEMINI') {
        provider = new GeminiProvider('gemini-1.5-flash', process.env.GEMINI_API_KEY);
      } else {
        provider = this.aiProvider;
      }

      const result = await provider.generatePitch(context);

      // Atomic Version Allocation in a Database Transaction to prevent race conditions
      const pitch = await db.$transaction(async (tx) => {
        const latestPitch = await tx.pitch.findFirst({
          where: { prospectId, organizationId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const nextVersion = (latestPitch?.version ?? 0) + 1;

        return tx.pitch.create({
          data: {
            prospectId,
            organizationId,
            version: nextVersion,
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
    return db.pitch.findMany({
      where: { prospectId, organizationId },
      orderBy: { version: 'desc' },
    });
  }
}

export const pitchService = new PitchService();
