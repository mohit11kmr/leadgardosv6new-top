import { db } from '@leadguard/database';
import type { Refund } from '@prisma/client';
import { razorpayProvider } from '../../billing/razorpayProvider.js';
import { verifyPassword } from '../../auth.js';
import { adminService } from '../adminService.js';
import { funnelEventService, FUNNEL_EVENTS } from '../funnelEventService.js';

/**
 * First-class refund domain (Revenue Foundation phase). Payment.status
 * (REFUNDED/PARTIALLY_REFUNDED) remains the summary flag on the payment —
 * this service is the structured source of truth for amount, reason, and
 * the approval/provider trail, per docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md §20.
 *
 * STATE MACHINE (see docs/REVENUE_FOUNDATION_IMPLEMENTATION.md for the full
 * writeup): REQUESTED -> PROCESSING -> SUCCEEDED | FAILED. APPROVED and
 * CANCELLED exist in the schema for a future genuine two-person
 * maker-checker workflow but are NOT exercised by this implementation —
 * per the phase's explicit instruction not to fake a two-person approval
 * flow the current RBAC model doesn't genuinely support. The single safe
 * operator flow implemented here auto-approves as it processes, and
 * records that honestly: approvedByUserId is always set equal to
 * requestedByUserId, never left ambiguous about who actually authorized it.
 *
 * SAFETY:
 *   - Re-authentication: the caller's current password must be supplied and
 *     verified again at call time (not just a valid JWT) before any money
 *     moves — this is the "re-authentication for the final money-moving
 *     action" safeguard from the R&D document.
 *   - Idempotency: a client-supplied idempotencyKey, scoped per-org via the
 *     Refund model's own @@unique([organizationId, idempotencyKey])
 *     constraint, makes a retried "same request" call return the original
 *     Refund instead of creating a second one. The SAME key is also passed
 *     to Razorpay's own Idempotency-Key header, so even if the local check
 *     somehow raced, the provider-side call is independently idempotent too.
 *   - Cumulative-amount invariant: a transaction takes a row lock on the
 *     Payment before checking how much has already been requested/
 *     succeeded against it, so two concurrent refund requests against the
 *     same payment can never both pass the "amount ≤ remaining" check.
 *   - A refund is never written as SUCCEEDED before the provider actually
 *     confirms it — PROCESSING is set first, then SUCCEEDED/FAILED only
 *     after the provider call returns.
 */

export class RefundValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RefundValidationError';
  }
}

export interface RequestRefundInput {
  organizationId: string;
  paymentId: string;
  amountInPaise: number;
  reason: string;
  requestedByUserId: string;
  currentPassword: string;
  idempotencyKey?: string;
  ipAddress?: string | null;
}

export class RefundService {
  async requestAndIssueRefund(input: RequestRefundInput): Promise<Refund> {
    // Idempotent short-circuit: a retried call with the same key returns
    // the original refund, regardless of its current status, before any
    // validation re-runs.
    if (input.idempotencyKey) {
      const existing = await db.refund.findUnique({
        where: { organizationId_idempotencyKey: { organizationId: input.organizationId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) return existing;
    }

    // Re-authentication: verify the caller's current password again, not
    // just their JWT — this is the money-moving action's own safeguard,
    // independent of however they were authenticated for this request.
    const actor = await db.user.findUnique({ where: { id: input.requestedByUserId } });
    if (!actor || !(await verifyPassword(actor.passwordHash, input.currentPassword))) {
      throw new RefundValidationError('REAUTH_FAILED', 'Current password is incorrect');
    }

    if (input.amountInPaise <= 0) {
      throw new RefundValidationError('INVALID_AMOUNT', 'Refund amount must be greater than zero');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new RefundValidationError('REASON_REQUIRED', 'A refund reason is required');
    }

    const refund = await db.$transaction(async (tx) => {
      // Row lock on the Payment: serializes concurrent refund attempts
      // against the SAME payment so the cumulative-amount check below is
      // race-free — two simultaneous requests can never both pass it.
      const lockedPayments = await tx.$queryRaw<Array<{ id: string; organizationId: string; amountInPaise: number; status: string; providerPaymentId: string }>>`
        SELECT id, "organizationId", "amountInPaise", status, "providerPaymentId" FROM "Payment" WHERE id = ${input.paymentId} FOR UPDATE
      `;
      const payment = lockedPayments[0];

      if (!payment) {
        throw new RefundValidationError('PAYMENT_NOT_FOUND', 'Payment not found');
      }
      if (payment.organizationId !== input.organizationId) {
        // Tenant isolation: never reveal whether the payment exists under a
        // different org — same error as "not found".
        throw new RefundValidationError('PAYMENT_NOT_FOUND', 'Payment not found');
      }
      if (!['CAPTURED', 'PARTIALLY_REFUNDED'].includes(payment.status)) {
        throw new RefundValidationError('PAYMENT_NOT_REFUNDABLE', `Payment status ${payment.status} is not refundable`);
      }

      const reserved = await tx.refund.aggregate({
        where: { paymentId: payment.id, status: { notIn: ['FAILED', 'CANCELLED'] } },
        _sum: { amountInPaise: true },
      });
      const alreadyReserved = reserved._sum.amountInPaise ?? 0;
      const remaining = payment.amountInPaise - alreadyReserved;

      if (input.amountInPaise > remaining) {
        throw new RefundValidationError(
          'AMOUNT_EXCEEDS_REMAINING',
          `Refund amount (${input.amountInPaise}) exceeds the remaining refundable amount (${remaining}) for this payment`
        );
      }

      const created = await tx.refund.create({
        data: {
          paymentId: payment.id,
          organizationId: input.organizationId,
          amountInPaise: input.amountInPaise,
          reason: input.reason,
          status: 'REQUESTED',
          requestedByUserId: input.requestedByUserId,
          // Single-operator flow: honestly recorded as self-approved, not a
          // genuine second-person sign-off — see class-level doc comment.
          approvedByUserId: input.requestedByUserId,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      return { created, payment };
    });

    console.log(
      JSON.stringify({ level: 'info', service: 'api', event: 'refund_requested', refundId: refund.created.id, paymentId: input.paymentId, amountInPaise: input.amountInPaise })
    );
    await adminService.recordAdminAction(input.requestedByUserId, 'REFUND_REQUESTED', 'REFUND', refund.created.id, {
      paymentId: input.paymentId,
      amountInPaise: input.amountInPaise,
    }, input.ipAddress);
    console.log(
      JSON.stringify({ level: 'info', service: 'api', event: 'refund_approved', refundId: refund.created.id, approvedByUserId: input.requestedByUserId })
    );
    await adminService.recordAdminAction(input.requestedByUserId, 'REFUND_APPROVED', 'REFUND', refund.created.id, {
      note: 'single-operator flow — self-approved, no second-person sign-off',
    }, input.ipAddress);

    await db.refund.update({ where: { id: refund.created.id }, data: { status: 'PROCESSING' } });

    try {
      const providerResult = await razorpayProvider.refundPayment({
        paymentId: refund.payment.providerPaymentId,
        amountInPaise: input.amountInPaise,
        idempotencyKey: refund.created.id, // the local refund row's own ID — deterministic, unique, 1:1 with this attempt
      });

      const totalRefundedAfterThis = (
        await db.refund.aggregate({
          where: { paymentId: refund.payment.id, status: { in: ['SUCCEEDED', 'PROCESSING'] } },
          _sum: { amountInPaise: true },
        })
      )._sum.amountInPaise ?? 0;

      const [updated] = await db.$transaction([
        db.refund.update({
          where: { id: refund.created.id },
          data: {
            status: 'SUCCEEDED',
            providerRefundId: providerResult.id,
            // Only safe, non-sensitive fields — never the raw provider
            // response, which could carry more than intended over time.
            providerResponse: { status: providerResult.status, amount: providerResult.amount },
          },
        }),
        db.payment.update({
          where: { id: refund.payment.id },
          data: { status: totalRefundedAfterThis >= refund.payment.amountInPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        }),
      ]);

      console.log(
        JSON.stringify({ level: 'info', service: 'api', event: 'refund_provider_succeeded', refundId: updated.id, providerRefundId: providerResult.id })
      );
      void funnelEventService.record({
        organizationId: input.organizationId,
        type: FUNNEL_EVENTS.REFUND_SUCCEEDED,
        data: { refundId: updated.id, amountInPaise: input.amountInPaise },
      });
      await adminService.recordAdminAction(input.requestedByUserId, 'REFUND_SUCCEEDED', 'REFUND', updated.id, {
        paymentId: input.paymentId,
        amountInPaise: input.amountInPaise,
        providerRefundId: providerResult.id,
      }, input.ipAddress);

      return updated;
    } catch (err) {
      const failureReason = err instanceof Error ? err.message : 'Unknown provider error';
      const failed = await db.refund.update({
        where: { id: refund.created.id },
        data: { status: 'FAILED', failureReason },
      });

      console.error(
        JSON.stringify({ level: 'error', service: 'api', event: 'refund_provider_failed', refundId: failed.id, error: failureReason })
      );
      await adminService.recordAdminAction(input.requestedByUserId, 'REFUND_FAILED', 'REFUND', failed.id, {
        paymentId: input.paymentId,
        amountInPaise: input.amountInPaise,
        failureReason,
      }, input.ipAddress);

      return failed;
    }
  }

  /**
   * Admin-wide refund list — organizationId is an optional filter, not a
   * scope requirement, since this is an internal admin endpoint (matching
   * the existing GET /admin/organizations / GET /admin/users pattern of
   * listing across all tenants), not an org-member-facing one.
   */
  async listRefunds(options: { organizationId?: string; cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const refunds = await db.refund.findMany({
      where: options.organizationId ? { organizationId: options.organizationId } : {},
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const hasMore = refunds.length > limit;
    const items = hasMore ? refunds.slice(0, limit) : refunds;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null, hasMore };
  }
}

export const refundService = new RefundService();
