import { db } from '@leadguard/database';

export interface PlanEntitlements {
  auditsPerMonth: number;
  websites: number;
  monitoring: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  reports: number;
  prospectLimit: number;
  clientLimit: number;
  prospectCampaignLimit: number;
  prospectLimitPerCampaign: number;
  pitchLimit: number;
  widgetLimit: number;
  competitorLimit: number;
}

export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlements = {
  auditsPerMonth: 3,
  websites: 1,
  monitoring: false,
  apiAccess: false,
  whiteLabel: false,
  reports: 3,
  prospectLimit: 0,
  clientLimit: 0,
  prospectCampaignLimit: 0,
  prospectLimitPerCampaign: 0,
  pitchLimit: 0,
  widgetLimit: 0,
  competitorLimit: 0,
};

export const DEFAULT_PRO_ENTITLEMENTS: PlanEntitlements = {
  auditsPerMonth: 100,
  websites: 5,
  monitoring: true,
  apiAccess: true,
  whiteLabel: false,
  reports: 50,
  prospectLimit: 50,
  clientLimit: 0,
  prospectCampaignLimit: 2,
  prospectLimitPerCampaign: 50,
  pitchLimit: 25,
  widgetLimit: 1,
  competitorLimit: 2,
};

export const DEFAULT_AGENCY_ENTITLEMENTS: PlanEntitlements = {
  auditsPerMonth: 1000,
  websites: 25,
  monitoring: true,
  apiAccess: true,
  whiteLabel: true,
  reports: 500,
  prospectLimit: 5000,
  clientLimit: 25,
  prospectCampaignLimit: 50,
  prospectLimitPerCampaign: 500,
  pitchLimit: 500,
  widgetLimit: 10,
  competitorLimit: 10,
};

export const DEFAULT_ENTERPRISE_ENTITLEMENTS: PlanEntitlements = {
  auditsPerMonth: 10000,
  websites: 100,
  monitoring: true,
  apiAccess: true,
  whiteLabel: true,
  reports: 5000,
  prospectLimit: 50000,
  clientLimit: 100,
  prospectCampaignLimit: 250,
  prospectLimitPerCampaign: 2500,
  pitchLimit: 5000,
  widgetLimit: 50,
  competitorLimit: 50,
};

export class EntitlementService {
  private getCurrentPeriod(): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  async getOrganizationPlan(organizationId: string) {
    const activeSub = await db.subscription.findFirst({
      where: {
        organizationId,
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });

    if (activeSub?.plan) {
      const planCode = activeSub.plan.code;
      const baseDefaults =
        planCode === 'AGENCY'
          ? DEFAULT_AGENCY_ENTITLEMENTS
          : planCode === 'ENTERPRISE'
          ? DEFAULT_ENTERPRISE_ENTITLEMENTS
          : planCode === 'PRO'
          ? DEFAULT_PRO_ENTITLEMENTS
          : DEFAULT_FREE_ENTITLEMENTS;

      return {
        subscription: activeSub,
        plan: activeSub.plan,
        entitlements: {
          ...baseDefaults,
          ...(activeSub.plan.entitlements as object),
        } as PlanEntitlements,
      };
    }

    // Default to FREE tier
    let freePlan = await db.plan.findUnique({ where: { code: 'FREE' } });
    if (!freePlan) {
      freePlan = await db.plan.create({
        data: {
          code: 'FREE',
          name: 'Free Plan',
          priceInPaise: 0,
          currency: 'INR',
          entitlements: DEFAULT_FREE_ENTITLEMENTS as object,
        },
      });
    }

    return {
      subscription: null,
      plan: freePlan,
      entitlements: {
        ...DEFAULT_FREE_ENTITLEMENTS,
        ...(freePlan.entitlements as object),
      } as PlanEntitlements,
    };
  }

  async getCurrentUsage(organizationId: string, metric: 'AUDITS' | 'WEBSITES' | 'API_REQUESTS' | 'MONITORING') {
    const period = this.getCurrentPeriod();
    const record = await db.usageRecord.findUnique({
      where: {
        organizationId_period_metric: {
          organizationId,
          period,
          metric,
        },
      },
    });
    return record?.count ?? 0;
  }

  async recordUsage(
    organizationId: string,
    metric: 'AUDITS' | 'WEBSITES' | 'API_REQUESTS' | 'MONITORING',
    increment = 1
  ) {
    const period = this.getCurrentPeriod();
    return db.usageRecord.upsert({
      where: {
        organizationId_period_metric: {
          organizationId,
          period,
          metric,
        },
      },
      create: {
        organizationId,
        period,
        metric,
        count: increment,
      },
      update: {
        count: { increment },
      },
    });
  }

  async releaseUsage(
    organizationId: string,
    metric: 'AUDITS' | 'WEBSITES' | 'API_REQUESTS' | 'MONITORING',
    decrement = 1
  ) {
    const period = this.getCurrentPeriod();
    const current = await db.usageRecord.findUnique({
      where: {
        organizationId_period_metric: {
          organizationId,
          period,
          metric,
        },
      },
    });

    if (!current) return null;

    const count = Math.max(0, current.count - decrement);
    if (count === 0) {
      return db.usageRecord.delete({ where: { id: current.id } });
    }
    return db.usageRecord.update({ where: { id: current.id }, data: { count } });
  }

  async canRunAudit(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    const auditsUsed = await this.getCurrentUsage(organizationId, 'AUDITS');

    if (auditsUsed >= entitlements.auditsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly audit quota exhausted (${auditsUsed}/${entitlements.auditsPerMonth}). Upgrade to Pro or Agency for higher limits.`,
      };
    }
    return { allowed: true };
  }

  async canAddWebsite(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    const activeWebsitesCount = await db.website.count({
      where: { organizationId, deletedAt: null },
    });

    if (activeWebsitesCount >= entitlements.websites) {
      return {
        allowed: false,
        reason: `Website quota reached (${activeWebsitesCount}/${entitlements.websites}). Upgrade your plan to monitor more domains.`,
      };
    }
    return { allowed: true };
  }

  async getAllowedWebsites(organizationId: string): Promise<number> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    return entitlements.websites;
  }

  async canUseMonitoring(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (!entitlements.monitoring) {
      return {
        allowed: false,
        reason: 'Real-time Watchdog monitoring requires a Pro, Agency, or Watchdog subscription.',
      };
    }
    return { allowed: true };
  }

  async canUseApiKeys(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (!entitlements.apiAccess) {
      return {
        allowed: false,
        reason: 'Programmatic API key generation requires a Pro or Agency subscription.',
      };
    }
    return { allowed: true };
  }

  async canManageClients(organizationId: string): Promise<{ allowed: boolean; reason?: string; limit: number }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (entitlements.clientLimit <= 0) {
      return {
        allowed: false,
        reason: 'Client Workspace management is an Agency/Enterprise feature. Upgrade your subscription.',
        limit: 0,
      };
    }

    const currentCount = await db.clientWorkspace.count({
      where: { organizationId, archivedAt: null },
    });

    if (currentCount >= entitlements.clientLimit) {
      return {
        allowed: false,
        reason: `Client workspace limit reached (${currentCount}/${entitlements.clientLimit}). Upgrade to Enterprise for more workspaces.`,
        limit: entitlements.clientLimit,
      };
    }

    return { allowed: true, limit: entitlements.clientLimit };
  }

  async canCreateProspectCampaign(
    organizationId: string,
    targetCount = 1
  ): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (entitlements.prospectCampaignLimit <= 0) {
      return {
        allowed: false,
        reason: '500-Site Prospect Hunter requires an Agency or Enterprise subscription.',
      };
    }

    if (targetCount > entitlements.prospectLimitPerCampaign) {
      return {
        allowed: false,
        reason: `Prospect campaign exceeds your plan limit of ${entitlements.prospectLimitPerCampaign} prospects per campaign.`,
      };
    }

    return { allowed: true };
  }

  async canGeneratePitch(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (entitlements.pitchLimit <= 0) {
      return {
        allowed: false,
        reason: 'AI Cold Pitch Generation requires a Pro, Agency, or Enterprise subscription.',
      };
    }
    return { allowed: true };
  }

  async canUseWhiteLabel(organizationId: string): Promise<{ allowed: boolean; reason?: string }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (!entitlements.whiteLabel) {
      return {
        allowed: false,
        reason: 'White-label custom branding and reports require an Agency or Enterprise subscription.',
      };
    }
    return { allowed: true };
  }

  async canManageWidgets(organizationId: string): Promise<{ allowed: boolean; reason?: string; limit: number }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (entitlements.widgetLimit <= 0) {
      return {
        allowed: false,
        reason: 'Diagnostic Studio Widgets require a Pro, Agency, or Enterprise subscription.',
        limit: 0,
      };
    }

    const currentCount = await db.widget.count({
      where: { organizationId },
    });

    if (currentCount >= entitlements.widgetLimit) {
      return {
        allowed: false,
        reason: `Widget limit reached (${currentCount}/${entitlements.widgetLimit}). Upgrade your plan to create more widgets.`,
        limit: entitlements.widgetLimit,
      };
    }

    return { allowed: true, limit: entitlements.widgetLimit };
  }

  async canManageCompetitors(organizationId: string): Promise<{ allowed: boolean; reason?: string; limit: number }> {
    const { entitlements } = await this.getOrganizationPlan(organizationId);
    if (entitlements.competitorLimit <= 0) {
      return {
        allowed: false,
        reason: 'Competitive Weakness Radar requires a Pro, Agency, or Enterprise subscription.',
        limit: 0,
      };
    }

    const currentCount = await db.competitorComparison.count({
      where: { organizationId },
    });

    if (currentCount >= entitlements.competitorLimit) {
      return {
        allowed: false,
        reason: `Competitive Radar limit reached (${currentCount}/${entitlements.competitorLimit}). Upgrade your plan.`,
        limit: entitlements.competitorLimit,
      };
    }

    return { allowed: true, limit: entitlements.competitorLimit };
  }

  async getEntitlementsOverview(organizationId: string) {
    const { plan, subscription, entitlements } = await this.getOrganizationPlan(organizationId);
    const auditsUsed = await this.getCurrentUsage(organizationId, 'AUDITS');
    const websitesCount = await db.website.count({
      where: { organizationId, deletedAt: null },
    });

    return {
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceInPaise: plan.priceInPaise,
        currency: plan.currency,
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      entitlements,
      usage: {
        audits: {
          used: auditsUsed,
          limit: entitlements.auditsPerMonth,
          remaining: Math.max(0, entitlements.auditsPerMonth - auditsUsed),
        },
        websites: {
          used: websitesCount,
          limit: entitlements.websites,
          remaining: Math.max(0, entitlements.websites - websitesCount),
        },
      },
    };
  }
}

export const entitlementService = new EntitlementService();
