import { db } from '@leadguard/database';

/**
 * Worker-side counterpart of apps/api/src/services/funnelEventService.ts —
 * deliberately duplicated, not shared via packages/shared, because that
 * package must stay free of @leadguard/database/@prisma/client (enforced by
 * tests/architecture.test.ts's browser-safety boundary test). Only the
 * subset of FUNNEL_EVENTS the orchestrator actually emits is declared here;
 * keep both vocabularies in sync by hand if either changes.
 */
export const FUNNEL_EVENTS = {
  AUDIT_STARTED: 'AUDIT_STARTED',
  AUDIT_COMPLETED: 'AUDIT_COMPLETED',
  FINDING_OPENED: 'FINDING_OPENED',
  FINDING_RESOLVED: 'FINDING_RESOLVED',
} as const;

export interface RecordFunnelEventInput {
  organizationId: string;
  type: string;
  websiteId?: string | null;
  auditId?: string | null;
  data?: Record<string, unknown> | null;
}

export class FunnelEventService {
  async record(input: RecordFunnelEventInput): Promise<void> {
    try {
      await db.funnelEvent.create({
        data: {
          organizationId: input.organizationId,
          type: input.type,
          websiteId: input.websiteId ?? undefined,
          auditId: input.auditId ?? undefined,
          data: (input.data as any) ?? undefined,
        },
      });
    } catch (error) {
      console.log(
        JSON.stringify({
          level: 'warn',
          service: 'funnel',
          event: 'funnel_event_record_failed',
          type: input.type,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    }
  }
}

export const funnelEventService = new FunnelEventService();
