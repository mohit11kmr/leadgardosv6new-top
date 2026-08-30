import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { entitlementService } from '../entitlementService.js';
import { validateSafeProspectUrl } from './prospectService.js';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
export const competitorQueue = new Queue('agency-competitor', { connection });

export class CompetitorService {
  async createCompetitorComparison(
    organizationId: string,
    input: {
      name: string;
      targetUrl: string;
      competitorUrls: string[];
      clientWorkspaceId?: string;
    }
  ) {
    const entitlement = await entitlementService.canManageCompetitors(organizationId);
    if (!entitlement.allowed) {
      const err = new Error(entitlement.reason);
      (err as unknown as { code: string }).code = 'PLAN_LIMIT_REACHED';
      throw err;
    }

    const targetVal = await validateSafeProspectUrl(input.targetUrl);
    if (!targetVal.isValid || !targetVal.normalizedUrl) {
      throw new Error(`Invalid target URL: ${targetVal.error}`);
    }

    const validCompetitorUrls: string[] = [];
    for (const compUrl of input.competitorUrls) {
      const compVal = await validateSafeProspectUrl(compUrl);
      if (compVal.isValid && compVal.normalizedUrl) {
        validCompetitorUrls.push(compVal.normalizedUrl);
      }
    }

    if (validCompetitorUrls.length === 0) {
      throw new Error('At least one valid competitor URL is required');
    }

    const comparison = await db.competitorComparison.create({
      data: {
        organizationId,
        clientWorkspaceId: input.clientWorkspaceId || null,
        name: input.name,
        targetUrl: targetVal.normalizedUrl,
        competitorUrls: validCompetitorUrls,
        status: 'DRAFT',
      },
    });

    // Enqueue initial benchmark execution
    await competitorQueue.add(
      'run-comparison',
      { comparisonId: comparison.id, organizationId },
      { jobId: `comp_${comparison.id}` }
    );

    return comparison;
  }

  async listCompetitorComparisons(organizationId: string) {
    return db.competitorComparison.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        clientWorkspace: { select: { id: true, name: true } },
      },
    });
  }

  async getCompetitorComparison(organizationId: string, id: string) {
    return db.competitorComparison.findFirst({
      where: { id, organizationId },
      include: {
        clientWorkspace: true,
      },
    });
  }

  async runCompetitorComparison(organizationId: string, id: string) {
    const comparison = await db.competitorComparison.findFirst({
      where: { id, organizationId },
    });
    if (!comparison) throw new Error('Competitor comparison not found');

    await db.competitorComparison.update({
      where: { id },
      data: { status: 'QUEUED' },
    });

    const job = await competitorQueue.add(
      'run-comparison',
      { comparisonId: id, organizationId },
      { jobId: `comp_${id}_${Date.now()}` }
    );

    return { enqueued: true, jobId: job.id, status: 'QUEUED' };
  }

  async deleteCompetitorComparison(organizationId: string, id: string) {
    const comparison = await db.competitorComparison.findFirst({
      where: { id, organizationId },
    });
    if (!comparison) throw new Error('Competitor comparison not found');

    return db.competitorComparison.delete({
      where: { id },
    });
  }
}

export const competitorService = new CompetitorService();
