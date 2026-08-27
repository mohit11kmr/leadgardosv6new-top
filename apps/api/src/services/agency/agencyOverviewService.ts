import { db } from '@leadguard/database';

export class AgencyOverviewService {
  async getOverview(organizationId: string) {
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

    return {
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
  }
}

export const agencyOverviewService = new AgencyOverviewService();
