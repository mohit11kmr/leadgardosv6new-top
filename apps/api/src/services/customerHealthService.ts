import { db } from '@leadguard/database';

/**
 * Customer health score v1 (Control Plane phase, Phase 4). Computed on
 * read — no `CustomerHealthSnapshot` table, no background job, per the
 * phase's explicit instruction. Every signal is read live from data this
 * product already has; no support-ticket signal is used because no support
 * domain exists yet (also per instruction).
 *
 * THRESHOLD CALIBRATION — read before changing any number below: the
 * environment this was built against has 254 organizations but only 98
 * audits and 25 active monitoring configs total, almost entirely test/dev
 * fixture data accumulated across this engagement's own test suites, not an
 * organic production customer base. There is not enough real usage data to
 * empirically calibrate "what counts as healthy engagement" — every
 * threshold below is a documented, provisional judgment call, not a
 * statistically derived cutoff. Revisit once real customer usage
 * distributions exist.
 */

export type HealthBand = 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';

export interface HealthSignalBreakdown {
  activeWebsites: number;
  auditsLast30Days: number;
  activeMonitoringConfigs: number;
  unresolvedCriticalFindings: number;
  unresolvedHighFindings: number;
  subscriptionStatus: string | null;
  paymentFailuresLast30Days: number;
  daysUntilRenewal: number | null;
}

export interface CustomerHealthResult {
  score: number;
  band: HealthBand;
  provisional: true;
  signals: HealthSignalBreakdown;
  reasons: string[];
  trend: { status: 'NOT_AVAILABLE'; reason: string };
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class CustomerHealthService {
  async computeHealth(organizationId: string): Promise<CustomerHealthResult> {
    const since30d = new Date(Date.now() - THIRTY_DAYS_MS);

    const [activeWebsites, auditsLast30Days, activeMonitoringConfigs, subscription, paymentFailuresLast30Days, latestAuditsPerWebsite] =
      await Promise.all([
        db.website.count({ where: { organizationId, deletedAt: null } }),
        db.audit.count({ where: { organizationId, createdAt: { gte: since30d } } }),
        db.monitoringConfig.count({ where: { organizationId, enabled: true } }),
        db.subscription.findFirst({
          where: { organizationId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED'] } },
          orderBy: { createdAt: 'desc' },
          select: { status: true, currentPeriodEnd: true },
        }),
        db.payment.count({ where: { organizationId, status: 'FAILED', createdAt: { gte: since30d } } }),
        // Latest audit per website, to compute "currently unresolved" findings
        // — AuditFinding has no resolvedAt column (confirmed by direct schema
        // inspection), so "unresolved" here means "still present in the most
        // recent audit for that website", not a stateful resolution flag.
        db.website.findMany({
          where: { organizationId, deletedAt: null },
          select: { audits: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true } } },
        }),
      ]);

    const latestAuditIds = latestAuditsPerWebsite.flatMap((w) => w.audits.map((a) => a.id)).filter(Boolean);
    const [unresolvedCriticalFindings, unresolvedHighFindings] = latestAuditIds.length
      ? await Promise.all([
          db.auditFinding.count({ where: { auditId: { in: latestAuditIds }, severity: 'CRITICAL' } }),
          db.auditFinding.count({ where: { auditId: { in: latestAuditIds }, severity: 'HIGH' } }),
        ])
      : [0, 0];

    const daysUntilRenewal = subscription?.currentPeriodEnd
      ? Math.round((subscription.currentPeriodEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

    const signals: HealthSignalBreakdown = {
      activeWebsites,
      auditsLast30Days,
      activeMonitoringConfigs,
      unresolvedCriticalFindings,
      unresolvedHighFindings,
      subscriptionStatus: subscription?.status ?? null,
      paymentFailuresLast30Days,
      daysUntilRenewal,
    };

    let score = 100;
    const reasons: string[] = [];

    if (activeWebsites === 0) {
      score -= 40;
      reasons.push('No active websites configured — the product has nothing to act on for this customer yet.');
    } else if (auditsLast30Days === 0) {
      score -= 15;
      reasons.push('Engagement decreased — no audits run in the last 30 days.');
    } else {
      reasons.push(`Actively engaged — ${auditsLast30Days} audit(s) run in the last 30 days.`);
    }

    if (activeWebsites > 0 && activeMonitoringConfigs === 0) {
      score -= 10;
      reasons.push('Monitoring is inactive — no active Watchdog configuration for any website.');
    }

    if (unresolvedCriticalFindings > 0) {
      score -= 15;
      reasons.push(`${unresolvedCriticalFindings} critical finding(s) remain unresolved in the most recent audit.`);
    } else if (unresolvedHighFindings > 0) {
      score -= 8;
      reasons.push(`${unresolvedHighFindings} high-severity finding(s) remain unresolved in the most recent audit.`);
    }

    if (subscription?.status === 'CANCELLED' || subscription?.status === 'EXPIRED' || !subscription) {
      score -= 100;
      reasons.push('No active subscription — this organization is not a currently paying customer.');
    } else if (subscription.status === 'PAST_DUE') {
      score -= 20;
      reasons.push('Subscription is past due.');
    }

    if (paymentFailuresLast30Days > 0) {
      score -= 15;
      reasons.push(`${paymentFailuresLast30Days} failed payment(s) in the last 30 days.`);
    }

    score = Math.max(0, Math.min(100, score));
    const band: HealthBand = score >= 70 ? 'HEALTHY' : score >= 40 ? 'NEEDS_ATTENTION' : 'AT_RISK';

    if (reasons.length === 0) {
      reasons.push('No negative signals detected.');
    }

    return {
      score,
      band,
      provisional: true,
      signals,
      reasons,
      trend: {
        status: 'NOT_AVAILABLE',
        reason: 'Health is computed on read from live signals; no historical health snapshot is stored yet, so a trend cannot be shown without fabricating one.',
      },
    };
  }
}

export const customerHealthService = new CustomerHealthService();
