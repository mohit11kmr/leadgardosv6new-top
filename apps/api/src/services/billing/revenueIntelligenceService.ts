import { db } from '@leadguard/database';

/**
 * Revenue Intelligence calculation layer (Revenue Foundation phase).
 *
 * Every metric here is a read-time PostgreSQL aggregation over existing
 * tables — no materialized/rollup table. Per docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md
 * §11, this is a missing-calculation-layer gap, not a missing-data gap, for
 * every metric implemented here.
 *
 * MONEY PRECISION: every internal amount is an integer paise value. The only
 * division performed (yearly plan price / 12 for MRR normalization) rounds
 * to the nearest paisa via Math.round — never left as a float, never
 * accumulated as a float. Conversion to rupees is a presentation-layer
 * concern (paise / 100), never done before summing.
 *
 * TIMEZONE: all period boundaries are computed in UTC. This is a
 * company-wide financial metric, not a per-user display value — using any
 * single user's timezone would make "this month" ambiguous depending on who
 * asks, which is exactly the ambiguity the phase's own instructions warn
 * against. UTC is the one unambiguous choice.
 *
 * SEMANTIC RULES (do not violate these when modifying this file):
 *   - MRR is a snapshot of *recurring* revenue capacity, computed from
 *     Subscription+Plan — it is never derived from Payment amounts.
 *   - "Revenue collected" is derived from Payment amounts — it is never
 *     called MRR, and is never netted against refunds (gross captured
 *     amount) unless a metric is explicitly named "net".
 *   - A renewal payment is not New MRR. New MRR is driven by
 *     Subscription.createdAt falling inside the period, not by any Payment
 *     row at all.
 *   - A plan-upgrade payment is not automatically counted as Expansion MRR
 *     — see expansionMrr's UNSUPPORTED status below for why.
 */

export interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

export type PeriodInput = 'today' | 'current_month' | 'previous_month' | { start: string; end: string };

/** All boundaries computed in UTC — see module header. */
export function resolvePeriod(input: PeriodInput): PeriodRange {
  const now = new Date();

  if (input === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end, label: 'today' };
  }

  if (input === 'current_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end, label: 'current_month' };
  }

  if (input === 'previous_month') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { start, end, label: 'previous_month' };
  }

  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('Invalid custom period range: start/end must be valid dates with end > start');
  }
  return { start, end, label: `${input.start}..${input.end}` };
}

/** Normalizes a Plan's price to a monthly-equivalent, in integer paise. Rounds to the nearest paisa — never left as a float. */
function monthlyEquivalentPaise(priceInPaise: number, billingInterval: string): number {
  switch (billingInterval) {
    case 'YEARLY':
      return Math.round(priceInPaise / 12);
    case 'ONE_TIME':
      // A one-time-billed plan contributes nothing to *recurring* revenue —
      // excluded from MRR by definition, not an error.
      return 0;
    case 'MONTHLY':
    default:
      return priceInPaise;
  }
}

export interface MrrResult {
  amountInPaise: number;
  organizationCount: number;
}

export interface UnsupportedMetric {
  status: 'UNSUPPORTED';
  reason: string;
}

export interface RevenueSummary {
  currency: 'INR';
  asOf: string;
  period: { label: string; start: string; end: string };
  currentMrr: MrrResult;
  currentArr: { amountInPaise: number };
  newMrr: { amountInPaise: number; subscriptionCount: number; semantics: string };
  churnedMrr: { amountInPaise: number; subscriptionCount: number; semantics: string };
  expansionMrr: UnsupportedMetric;
  contractionMrr: UnsupportedMetric;
  collectedRevenue: { amountInPaise: number; paymentCount: number };
  failedPaymentAmount: { amountInPaise: number; paymentCount: number };
  revenueByPlan: Array<{ planCode: string; planName: string; amountInPaise: number; paymentCount: number }>;
}

const EXPANSION_UNSUPPORTED: UnsupportedMetric = {
  status: 'UNSUPPORTED',
  reason:
    'Expansion MRR requires a reliable before/after plan comparison per PLAN_UPGRADE payment. PaymentPurpose.PLAN_UPGRADE exists, but the payment amount alone does not reliably reconstruct which plan the org upgraded FROM — a partial-period proration or a manually-adjusted charge would produce the same payment shape as a true expansion. Returning a computed number here would be a guess, not a measurement.',
};

const CONTRACTION_UNSUPPORTED: UnsupportedMetric = {
  status: 'UNSUPPORTED',
  reason:
    'Contraction MRR has no reliable signal in the current schema at all — there is no downgrade-tracking event or PaymentPurpose value, unlike PLAN_UPGRADE for expansion. Inferring a downgrade from a payment-amount decrease would be a fabrication, not a measurement, and is explicitly disallowed.',
};

export class RevenueIntelligenceService {
  /**
   * Current MRR: every organization's single most-recent ACTIVE subscription,
   * normalized to monthly. Explicitly guards against double-counting an
   * organization with more than one historical subscription row (only the
   * latest ACTIVE one per org is summed, via DISTINCT ON) — this holds even
   * if the "at most one active subscription per org" invariant (tested
   * separately) were ever violated by a data bug.
   */
  async getCurrentMrr(): Promise<MrrResult> {
    const rows = await db.$queryRaw<Array<{ priceInPaise: number; billingInterval: string }>>`
      SELECT DISTINCT ON (s."organizationId") p."priceInPaise", p."billingInterval"
      FROM "Subscription" s
      JOIN "Plan" p ON p.id = s."planId"
      WHERE s.status = 'ACTIVE'
      ORDER BY s."organizationId", s."createdAt" DESC
    `;

    let amountInPaise = 0;
    for (const row of rows) {
      amountInPaise += monthlyEquivalentPaise(row.priceInPaise, row.billingInterval);
    }

    return { amountInPaise, organizationCount: rows.length };
  }

  getCurrentArr(mrr: MrrResult): { amountInPaise: number } {
    return { amountInPaise: mrr.amountInPaise * 12 };
  }

  /**
   * Current MRR for one specific organization (Control Plane phase) — same
   * semantics as getCurrentMrr (single most-recent ACTIVE subscription,
   * normalized to monthly), scoped to one org for the Customer 360 revenue
   * panel. Not derived from getCurrentMrr's aggregate rows, since those
   * don't retain per-org identity after the SUM.
   */
  async getOrgMrr(organizationId: string): Promise<MrrResult> {
    const rows = await db.$queryRaw<Array<{ priceInPaise: number; billingInterval: string }>>`
      SELECT DISTINCT ON (s."organizationId") p."priceInPaise", p."billingInterval"
      FROM "Subscription" s
      JOIN "Plan" p ON p.id = s."planId"
      WHERE s.status = 'ACTIVE' AND s."organizationId" = ${organizationId}
      ORDER BY s."organizationId", s."createdAt" DESC
    `;
    let amountInPaise = 0;
    for (const row of rows) {
      amountInPaise += monthlyEquivalentPaise(row.priceInPaise, row.billingInterval);
    }
    return { amountInPaise, organizationCount: rows.length };
  }

  /**
   * New MRR: subscriptions whose createdAt falls inside the period AND
   * whose CURRENT status is ACTIVE or TRIALING — i.e., subscriptions that
   * started in this period and are still contributing to current recurring
   * revenue as of "now" (not subscriptions that started and were also
   * cancelled within the same period, which contribute to both New and
   * Churned in real MRR-movement accounting but are excluded here rather
   * than double-modeled, since this service does not yet track point-in-time
   * historical MRR snapshots). This exact definition is deliberately stated
   * here because MRR-movement definitions vary meaningfully by vendor (see
   * docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md §16) — there is no single
   * universally "correct" one.
   */
  async getNewMrr(period: PeriodRange): Promise<{ amountInPaise: number; subscriptionCount: number }> {
    const subs = await db.subscription.findMany({
      where: {
        createdAt: { gte: period.start, lt: period.end },
        status: { in: ['ACTIVE', 'TRIALING'] },
      },
      select: { plan: { select: { priceInPaise: true, billingInterval: true } } },
    });

    let amountInPaise = 0;
    for (const sub of subs) {
      amountInPaise += monthlyEquivalentPaise(sub.plan.priceInPaise, sub.plan.billingInterval);
    }
    return { amountInPaise, subscriptionCount: subs.length };
  }

  /**
   * Churned MRR: subscriptions with status CANCELLED or EXPIRED whose
   * churn timestamp falls inside the period. "Churn timestamp" is
   * COALESCE(canceledAt, updatedAt) — canceledAt is only ever set by an
   * explicit cancellation; an automatic EXPIRED transition has no dedicated
   * timestamp field in the current schema, so updatedAt (the last time the
   * row's status changed) is used as the best available proxy. This
   * fallback is stated explicitly because it is an assumption, not a
   * guarantee — see docs/REVENUE_FOUNDATION_IMPLEMENTATION.md.
   */
  async getChurnedMrr(period: PeriodRange): Promise<{ amountInPaise: number; subscriptionCount: number }> {
    const rows = await db.$queryRaw<Array<{ priceInPaise: number; billingInterval: string }>>`
      SELECT p."priceInPaise", p."billingInterval"
      FROM "Subscription" s
      JOIN "Plan" p ON p.id = s."planId"
      WHERE s.status IN ('CANCELLED', 'EXPIRED')
        AND COALESCE(s."canceledAt", s."updatedAt") >= ${period.start}
        AND COALESCE(s."canceledAt", s."updatedAt") < ${period.end}
    `;

    let amountInPaise = 0;
    for (const row of rows) {
      amountInPaise += monthlyEquivalentPaise(row.priceInPaise, row.billingInterval);
    }
    return { amountInPaise, subscriptionCount: rows.length };
  }

  /**
   * Revenue collected: gross captured Payment amounts in the period.
   * Includes CAPTURED/REFUNDED/PARTIALLY_REFUNDED — all three represent
   * money that WAS captured (refund states are post-capture states, not
   * alternate non-captured ones) — never netted against the refunded
   * portion, per this service's explicit "collected ≠ net" semantic rule.
   */
  async getCollectedRevenue(period: PeriodRange, organizationId?: string): Promise<{ amountInPaise: number; paymentCount: number }> {
    const result = await db.payment.aggregate({
      where: {
        status: { in: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
        createdAt: { gte: period.start, lt: period.end },
        ...(organizationId ? { organizationId } : {}),
      },
      _sum: { amountInPaise: true },
      _count: true,
    });
    return { amountInPaise: result._sum.amountInPaise ?? 0, paymentCount: result._count };
  }

  async getFailedPaymentAmount(period: PeriodRange, organizationId?: string): Promise<{ amountInPaise: number; paymentCount: number }> {
    const result = await db.payment.aggregate({
      where: {
        status: 'FAILED',
        createdAt: { gte: period.start, lt: period.end },
        ...(organizationId ? { organizationId } : {}),
      },
      _sum: { amountInPaise: true },
      _count: true,
    });
    return { amountInPaise: result._sum.amountInPaise ?? 0, paymentCount: result._count };
  }

  /** Revenue by plan — bounded (Plan is a small, finite table), safe to include in the general summary. */
  async getRevenueByPlan(period: PeriodRange): Promise<RevenueSummary['revenueByPlan']> {
    const payments = await db.payment.findMany({
      where: {
        status: { in: ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'] },
        createdAt: { gte: period.start, lt: period.end },
        subscriptionId: { not: null },
      },
      select: { amountInPaise: true, subscription: { select: { plan: { select: { code: true, name: true } } } } },
    });

    const byPlan = new Map<string, { planCode: string; planName: string; amountInPaise: number; paymentCount: number }>();
    for (const p of payments) {
      const plan = p.subscription?.plan;
      if (!plan) continue;
      const existing = byPlan.get(plan.code) ?? { planCode: plan.code, planName: plan.name, amountInPaise: 0, paymentCount: 0 };
      existing.amountInPaise += p.amountInPaise;
      existing.paymentCount += 1;
      byPlan.set(plan.code, existing);
    }
    return [...byPlan.values()];
  }

  /** Revenue for one specific organization — used by the Customer 360 endpoint, not the general summary (unbounded org count makes a per-org breakdown unsafe to include there). */
  async getRevenueByOrganization(organizationId: string, period: PeriodRange) {
    const [collected, failed] = await Promise.all([
      this.getCollectedRevenue(period, organizationId),
      this.getFailedPaymentAmount(period, organizationId),
    ]);
    return { collectedRevenue: collected, failedPaymentAmount: failed };
  }

  async getSummary(period: PeriodRange): Promise<RevenueSummary> {
    const [currentMrr, newMrr, churnedMrr, collectedRevenue, failedPaymentAmount, revenueByPlan] = await Promise.all([
      this.getCurrentMrr(),
      this.getNewMrr(period),
      this.getChurnedMrr(period),
      this.getCollectedRevenue(period),
      this.getFailedPaymentAmount(period),
      this.getRevenueByPlan(period),
    ]);

    return {
      currency: 'INR',
      asOf: new Date().toISOString(),
      period: { label: period.label, start: period.start.toISOString(), end: period.end.toISOString() },
      currentMrr,
      currentArr: this.getCurrentArr(currentMrr),
      newMrr: {
        ...newMrr,
        semantics:
          'Subscriptions created in this period whose current status is ACTIVE or TRIALING. Does not include a subscription that started and was also cancelled within the same period.',
      },
      churnedMrr: {
        ...churnedMrr,
        semantics:
          'Subscriptions with status CANCELLED/EXPIRED whose churn timestamp (canceledAt, or updatedAt if canceledAt is unset) falls in this period.',
      },
      expansionMrr: EXPANSION_UNSUPPORTED,
      contractionMrr: CONTRACTION_UNSUPPORTED,
      collectedRevenue,
      failedPaymentAmount,
      revenueByPlan,
    };
  }
}

export const revenueIntelligenceService = new RevenueIntelligenceService();
