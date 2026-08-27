import { db } from '@leadguard/database';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';

const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const CACHE_TTL_SECONDS = 60;

export class AgencyOverviewService {
  async getOverview(organizationId: string) {
    const cacheKey = `agency:metrics:${organizationId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis cache read failure fallback to PostgreSQL
    }

    const [
      clientCount,
      websiteCount,
      auditCount,
      prospectCampaignCount,
      prospectCount,
      qualifiedProspectCount,
      widgetCount,
      competitorCount,
      criticalFindingsCount,
    ] = await Promise.all([
      db.clientWorkspace.count({ where: { organizationId, archivedAt: null } }),
      db.website.count({ where: { organizationId, deletedAt: null } }),
      db.audit.count({ where: { organizationId } }),
      db.prospectCampaign.count({ where: { organizationId } }),
      db.prospect.count({ where: { organizationId } }),
      db.prospect.count({ where: { organizationId, status: { in: ['QUALIFIED', 'CONTACTED', 'CONVERTED'] } } }),
      db.widget.count({ where: { organizationId, enabled: true } }),
      db.competitorComparison.count({ where: { organizationId } }),
      db.auditFinding.count({ where: { audit: { organizationId }, severity: 'CRITICAL' } }),
    ]);

    // Conservative estimated value from qualified prospect pipeline & critical audit fixes
    const estimatedPipelineOpportunityInr = qualifiedProspectCount * 25000 + criticalFindingsCount * 5000;

    const data = {
      metrics: {
        clients: clientCount,
        websites: websiteCount,
        audits: auditCount,
        campaigns: prospectCampaignCount,
        prospects: prospectCount,
        qualifiedProspects: qualifiedProspectCount,
        widgets: widgetCount,
        competitors: competitorCount,
        criticalFindings: criticalFindingsCount,
        estimatedPipelineOpportunityInr,
      },
    };

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write failures
    }

    return data;
  }

  async invalidateMetricsCache(organizationId: string) {
    try {
      await redis.del(`agency:metrics:${organizationId}`);
    } catch {
      // Ignore
    }
  }
}

export const agencyOverviewService = new AgencyOverviewService();
