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
