import { db } from '@leadguard/database';

export interface PlanEntitlements {
  auditsPerMonth: number;
  websites: number;
  monitoring: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  reports: number;
  prospectLimit: number;
}

export const DEFAULT_FREE_ENTITLEMENTS: PlanEntitlements = {
  auditsPerMonth: 3,
  websites: 1,
  monitoring: false,
  apiAccess: false,
  whiteLabel: false,
  reports: 3,
  prospectLimit: 0,
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
      return {
        subscription: activeSub,
        plan: activeSub.plan,
        entitlements: activeSub.plan.entitlements as unknown as PlanEntitlements,
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
      entitlements: freePlan.entitlements as unknown as PlanEntitlements,
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
