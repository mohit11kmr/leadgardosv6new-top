import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { db } from '@leadguard/database';
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
  pagesDiscovered: number;
  pagesFetched: number;
  pagesFailed: number;
  durationMs: number | null;
  completedAt: string | null;
  summary: Record<string, unknown> | null;
}

/**
 * Emits the `security.audit.completed` event via the transactional outbox and
 * dispatches to every matching enabled webhook endpoint (LG-021/LG-022).
 * Mirrors the API OutboxService.emitEvent contract.
 */
export async function emitVaultCompleted({
  organizationId,
  runId,
  websiteId,
  run,
}: {
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
    pagesDiscovered: number;
    pagesFetched: number;
    pagesFailed: number;
    durationMs: number | null;
    completedAt: Date | null;
    summary: unknown;
  };
}) {
  const payload: VaultRunWebhookPayload = {
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
    pagesDiscovered: run.pagesDiscovered,
    pagesFetched: run.pagesFetched,
    pagesFailed: run.pagesFailed,
    durationMs: run.durationMs,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    summary: (run.summary as Record<string, unknown> | null) ?? null,
  };

  const outboxEvent = await db.outboxEvent.create({
    data: {
      organizationId,
      eventType: VAULT_COMPLETED_EVENT,
      aggregateType: 'VaultAuditRun',
      aggregateId: runId,
      payload: payload as object,
      status: 'PENDING',
    },
  });

  const endpoints = await db.webhookEndpoint.findMany({
    where: { organizationId, enabled: true },
  });
  const matchingEndpoints = endpoints.filter(
    (ep) => ep.events.includes(VAULT_COMPLETED_EVENT) || ep.events.includes('*')
  );

  for (const endpoint of matchingEndpoints) {
    const deliveryId = randomUUID();
    await webhookQueue.add(
      'deliver-webhook',
      {
        deliveryId,
        webhookEndpointId: endpoint.id,
        organizationId,
        eventType: VAULT_COMPLETED_EVENT,
        url: endpoint.url,
        secretHash: endpoint.secretHash,
        payload,
        timestamp: Math.floor(Date.now() / 1000),
      },
      { jobId: `webhook_${deliveryId}` }
    );
  }

  await db.outboxEvent.update({
    where: { id: outboxEvent.id },
    data: { status: 'PUBLISHED', processedAt: new Date() },
  });

  return outboxEvent;
}
