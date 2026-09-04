import { db } from '@leadguard/database';
import { revenueIntelligenceService, resolvePeriod } from './billing/revenueIntelligenceService.js';
import { businessImpactTrendService, resolveTrendPeriod } from './businessImpactTrendService.js';
import { customerHealthService } from './customerHealthService.js';

const RECENT_LIMIT = 10;

/**
 * Customer 360 source-of-truth endpoint (Revenue Foundation phase). Per
 * docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md §19: this is a source
 * endpoint, not a UI payload — bounded (counts + recent N, never unbounded
 * child collections), and every independent query runs in parallel
 * (Promise.all) rather than sequentially, to avoid an N+1-shaped handler.
 *
 * SECURITY: every query below is filtered by the exact organizationId
 * param — there is no code path here that can return another
 * organization's data. Sensitive fields (passwordHash, tokenHash, apiKey
 * keyHash, webhook secretHash, SecurityEvent.metadata raw contents) are
 * never selected — only counts/labels are exposed for anything that could
 * carry a secret.
 */
export async function getOrganizationDetail(organizationId: string, options: { includeSecurity?: boolean } = {}) {
  const organization = await db.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    const err = new Error('Organization not found');
    (err as unknown as { code: string }).code = 'ORGANIZATION_NOT_FOUND';
    throw err;
  }

  const period = resolvePeriod('current_month');
  const trendPeriod = resolveTrendPeriod({ days: 30 });

  const [
    members,
    subscription,
    revenue,
    refunds,
    orgMrr,
    businessImpactTrend,
    health,
    websiteCount,
    auditCount,
    monitoringConfigCount,
    openFindingsCount,
    reportCount,
    clientWorkspaceCount,
    prospectCount,
    pitchCount,
    securityEventCount,
    recentSecurityEvents,
    recentFunnelEvents,
  ] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId },
      select: { userId: true, role: true, user: { select: { email: true, isDisabled: true } } },
    }),
    db.subscription.findFirst({
      where: { organizationId, status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: { select: { code: true, name: true, priceInPaise: true, billingInterval: true } },
      },
    }),
    revenueIntelligenceService.getRevenueByOrganization(organizationId, period),
    db.refund.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: { id: true, amountInPaise: true, status: true, reason: true, createdAt: true },
    }),
    revenueIntelligenceService.getOrgMrr(organizationId),
    businessImpactTrendService.getTrend(organizationId, { period: trendPeriod }),
    customerHealthService.computeHealth(organizationId),
    db.website.count({ where: { organizationId } }),
    db.audit.count({ where: { organizationId } }),
    db.monitoringConfig.count({ where: { organizationId, enabled: true } }),
    db.auditFinding.count({ where: { audit: { organizationId } } }),
    db.report.count({ where: { organizationId } }),
    db.clientWorkspace.count({ where: { organizationId } }),
    db.prospect.count({ where: { organizationId } }),
    db.pitch.count({ where: { organizationId } }),
    options.includeSecurity
      ? db.securityEvent.count({ where: { user: { memberships: { some: { organizationId } } } } })
      : Promise.resolve(0),
    options.includeSecurity
      ? db.securityEvent.findMany({
          where: { user: { memberships: { some: { organizationId } } } },
          orderBy: { createdAt: 'desc' },
          take: RECENT_LIMIT,
          select: { id: true, type: true, createdAt: true, ipAddress: true }, // never `metadata` — may carry more than intended
        })
      : Promise.resolve([]),
    db.funnelEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: { id: true, type: true, createdAt: true, websiteId: true, auditId: true },
    }),
  ]);

  // AdminAuditLog has no organizationId column (it's a generic, resourceType
  // + resourceId keyed log — see docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md
  // §2/§6). The only way to show "admin actions relevant to this org"
  // without fabricating an organizationId join is to look up actions whose
  // resourceId matches a resource we've already confirmed belongs to this
  // org — refunds, in this case, since they're already fetched above.
  const refundIds = refunds.map((r) => r.id);
  const recentAdminActions =
    refundIds.length > 0
      ? await db.adminAuditLog.findMany({
          where: { resourceType: 'REFUND', resourceId: { in: refundIds } },
          orderBy: { createdAt: 'desc' },
          take: RECENT_LIMIT,
          select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
        })
      : [];

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isSuspended: organization.isSuspended,
      suspendedReason: organization.suspendedReason,
      createdAt: organization.createdAt,
    },
    users: {
      count: members.length,
      members: members.map((m) => ({ userId: m.userId, role: m.role, email: m.user.email, isDisabled: m.user.isDisabled })),
    },
    subscription: subscription
      ? {
          status: subscription.status,
          plan: subscription.plan.code,
          planName: subscription.plan.name,
          priceInPaise: subscription.plan.priceInPaise,
          billingInterval: subscription.plan.billingInterval,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null,
    revenue: {
      period: period.label,
      // MRR/ARR come from the Subscription+Plan layer, never from Payment —
      // same source-of-truth rule as the company-wide revenue summary (see
      // revenueIntelligenceService.ts's own header comment).
      currentMrr: orgMrr,
      currentArr: { amountInPaise: orgMrr.amountInPaise * 12 },
      collectedRevenue: revenue.collectedRevenue,
      failedPaymentAmount: revenue.failedPaymentAmount,
      recentRefunds: refunds,
    },
    productUsage: {
      websites: websiteCount,
      audits: auditCount,
      activeMonitoringConfigs: monitoringConfigCount,
      openFindings: openFindingsCount,
      reports: reportCount,
    },
    businessImpactTrend,
    health,
    agency:
      clientWorkspaceCount > 0 || prospectCount > 0
        ? { clientWorkspaces: clientWorkspaceCount, prospects: prospectCount, pitches: pitchCount }
        : null,
    // Only populated when the caller also holds SECURITY_VIEW (checked by
    // the route, not here — see routes.ts) — CUSTOMER_360_VIEW alone is not
    // sufficient to see security events, per Phase 3's explicit instruction.
    security: options.includeSecurity
      ? { totalEventCount: securityEventCount, recentEvents: recentSecurityEvents }
      : { status: 'RESTRICTED', reason: 'Viewing security events requires the SECURITY_VIEW capability in addition to CUSTOMER_360_VIEW.' },
    activity: {
      recentFunnelEvents,
      recentAdminActions: recentAdminActions, // see note below
    },
  };
}
