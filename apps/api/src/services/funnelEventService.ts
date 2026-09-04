import { db } from '@leadguard/database';

export const FUNNEL_EVENTS = {
  FREE_SCAN_STARTED: 'FREE_SCAN_STARTED',
  FREE_SCAN_COMPLETED: 'FREE_SCAN_COMPLETED',
  RESULT_VIEWED: 'RESULT_VIEWED',
  EXPRESS_FIX_CLICKED: 'EXPRESS_FIX_CLICKED',
  CHECKOUT_STARTED: 'CHECKOUT_STARTED',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  FULFILLMENT_CREATED: 'FULFILLMENT_CREATED',

  // Core lifecycle vocabulary (Control Plane phase, Phase 6) — extends the
  // same FunnelEvent architecture rather than a new event bus, per the
  // R&D document's explicit decision. Each is emitted exactly once at the
  // real server-side state transition that constitutes it (see call sites),
  // never from a frontend action, and never duplicated when one DB
  // transition occurs.
  //
  // NOTE ON DUPLICATION: apps/worker's audit orchestrator needs this exact
  // same vocabulary + record() method (AUDIT_STARTED/AUDIT_COMPLETED/
  // FINDING_OPENED/FINDING_RESOLVED are emitted there, not here). It is
  // intentionally NOT shared via packages/shared — that package is
  // required to stay free of @leadguard/database and @prisma/client
  // (enforced by tests/architecture.test.ts's "packages/shared does NOT
  // import ... database drivers" boundary test), so a genuine shared
  // module here would violate that invariant. The implementation is small
  // (see below) and duplicated as apps/worker/src/audit/funnelEventService.ts
  // instead — keep the two FUNNEL_EVENTS vocabularies in sync by hand when
  // either changes.
  USER_SIGNED_UP: 'USER_SIGNED_UP',
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  AUDIT_STARTED: 'AUDIT_STARTED',
  AUDIT_COMPLETED: 'AUDIT_COMPLETED',
  REPORT_GENERATED: 'REPORT_GENERATED',
  SUBSCRIPTION_STARTED: 'SUBSCRIPTION_STARTED',
  SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  // Core (subscription-billing) payment success reuses a distinct name from
  // the guest funnel's PAYMENT_SUCCESS; PAYMENT_FAILED is deliberately the
  // SAME string as the guest funnel's above — one payment-failure vocabulary
  // across both flows, since both are genuinely "a payment failed" for this
  // organization and should be queryable as one type.
  PAYMENT_SUCCEEDED: 'PAYMENT_SUCCEEDED',
  REFUND_SUCCEEDED: 'REFUND_SUCCEEDED',
  MONITORING_STARTED: 'MONITORING_STARTED',
  PROSPECT_CREATED: 'PROSPECT_CREATED',
  PITCH_SENT: 'PITCH_SENT',
  FINDING_OPENED: 'FINDING_OPENED',
  FINDING_RESOLVED: 'FINDING_RESOLVED',
} as const;

export type FunnelEventType = (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS];

export interface RecordFunnelEventInput {
  organizationId: string;
  type: FunnelEventType | string;
  websiteId?: string | null;
  auditId?: string | null;
  leadId?: string | null;
  sessionId?: string | null;
  data?: Record<string, unknown> | null;
}

/**
 * Lightweight conversion-funnel event recorder (Phase 2 §15, §20).
 *
 * Uses the existing persistence layer. Internal only — never exposed to the
 * visitor. Events carry timestamps via createdAt.
 */
export class FunnelEventService {
  async record(input: RecordFunnelEventInput): Promise<void> {
    try {
      await db.funnelEvent.create({
        data: {
          organizationId: input.organizationId,
          type: input.type,
          websiteId: input.websiteId ?? undefined,
          auditId: input.auditId ?? undefined,
          leadId: input.leadId ?? undefined,
          sessionId: input.sessionId ?? undefined,
          data: (input.data as any) ?? undefined,
        },
      });
    } catch (error) {
      // Funnel tracking must never break the primary flow.
      console.log(JSON.stringify({
        level: 'warn',
        service: 'funnel',
        event: 'funnel_event_record_failed',
        type: input.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }
}

export const funnelEventService = new FunnelEventService();
