import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { db, type PrismaTransactionClient } from '@leadguard/database';
import { config } from '@leadguard/config';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

const webhookQueue = new Queue('webhook', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export const VAULT_COMPLETED_EVENT = 'VAULT_AUDIT_COMPLETED';

export interface VaultRunWebhookPayload {
  event: 'security.audit.completed';
  runId: string;
  websiteId: string;
  organizationId: string;
  mode: string;
  status: string;
  score: number;
  findingsCount: number;
  retestedFindings: number;
  fixedFindings: number;
  verifiedFindings: number;
  pagesDiscovered: number;
  pagesFetched: number;
  pagesFailed: number;
  durationMs: number | null;
  completedAt: string | null;
  summary: Record<string, unknown> | null;
}

export interface VaultCompletedInput {
  organizationId: string;
  runId: string;
  websiteId: string;
  run: {
    mode: string;
    status: string;
    score: number;
    findingsCount: number;
    retestedFindings: number;
    fixedFindings: number;
    verifiedFindings: number;
    pagesDiscovered: number;
    pagesFetched: number;
    pagesFailed: number;
    durationMs: number | null;
    completedAt: Date | null;
    summary: unknown;
  };
}

function buildPayload({ organizationId, runId, websiteId, run }: VaultCompletedInput): VaultRunWebhookPayload {
  return {
    event: 'security.audit.completed',
    runId,
    websiteId,
    organizationId,
    mode: run.mode,
    status: run.status,
    score: run.score,
    findingsCount: run.findingsCount,
    retestedFindings: run.retestedFindings,
    fixedFindings: run.fixedFindings,
    verifiedFindings: run.verifiedFindings,
    pagesDiscovered: run.pagesDiscovered,
    pagesFetched: run.pagesFetched,
    pagesFailed: run.pagesFailed,
    durationMs: run.durationMs,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    summary: (run.summary as Record<string, unknown> | null) ?? null,
  };
}

/**
 * Phase 1 of the transactional outbox: writes the OutboxEvent row only.
 * Accepts either the default `db` client or a `tx` inside `db.$transaction`,
 * so callers that need the outbox write to commit atomically with the
 * triggering state change (e.g. VaultAuditRun.status flipping to COMPLETED)
 * can pass `tx` and never end up with a completed run that has no
 * corresponding outbox row if the process crashes right after.
 */
export async function createVaultCompletedOutboxEvent(
  client: PrismaTransactionClient,
  input: VaultCompletedInput
) {
  const payload = buildPayload(input);
  const outboxEvent = await client.outboxEvent.create({
    data: {
      organizationId: input.organizationId,
      eventType: VAULT_COMPLETED_EVENT,
      aggregateType: 'VaultAuditRun',
      aggregateId: input.runId,
      payload: payload as object,
      status: 'PENDING',
    },
  });
  return { outboxEvent, payload };
}

/**
 * Phase 2: looks up matching webhook endpoints and enqueues delivery jobs for
 * an already-created outbox event, then marks it PUBLISHED. Not part of any
 * DB transaction (Redis/BullMQ can't participate in one) — safe to call
 * fire-and-forget after the phase-1 transaction commits, because if it fails
 * partway the event simply stays PENDING and outboxReplay.ts retries it.
 * deliveryId is deterministic (outboxEvent.id + endpoint.id) so that retry
 * never double-delivers to an endpoint that already got the job.
 */
export async function dispatchOutboxEvent(
  outboxEvent: { id: string },
  payload: Record<string, unknown>,
  organizationId: string,
  eventType: string
) {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { organizationId, enabled: true },
  });
  const matchingEndpoints = endpoints.filter(
    (ep) => ep.events.includes(eventType) || ep.events.includes('*')
  );

  let dispatchFailed = false;
  for (const endpoint of matchingEndpoints) {
    const deliveryId = `${outboxEvent.id}:${endpoint.id}`;
    try {
      await webhookQueue.add(
        'deliver-webhook',
        {
          deliveryId,
          webhookEndpointId: endpoint.id,
          organizationId,
          eventType,
          url: endpoint.url,
          secretHash: endpoint.secretHash,
          payload,
          timestamp: Math.floor(Date.now() / 1000),
        },
        { jobId: `webhook_${deliveryId}` }
      );
    } catch (err) {
      dispatchFailed = true;
      console.error(
        JSON.stringify({
          level: 'error',
          service: 'worker',
          event: 'webhook_enqueue_failed',
          outboxEventId: outboxEvent.id,
          webhookEndpointId: endpoint.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      );
    }
  }

  // Only mark PUBLISHED if every endpoint was successfully enqueued. If any
  // failed, the event stays PENDING so outboxReplay.ts retries it.
  if (!dispatchFailed) {
    await db.outboxEvent.update({
      where: { id: outboxEvent.id },
      data: { status: 'PUBLISHED', processedAt: new Date() },
    });
  }
}

/**
 * Convenience wrapper combining phase 1 + phase 2 for callers that don't need
 * the outbox write to be atomic with an outside transaction (e.g. tests, or
 * one-off emitters). vaultScan.ts uses the two phases directly instead, so it
 * can put phase 1 inside the same transaction as the VaultAuditRun update.
 */
export async function emitVaultCompleted(input: VaultCompletedInput) {
  const { outboxEvent, payload } = await createVaultCompletedOutboxEvent(db, input);
  await dispatchOutboxEvent(outboxEvent, payload as unknown as Record<string, unknown>, input.organizationId, VAULT_COMPLETED_EVENT);
  return outboxEvent;
}
