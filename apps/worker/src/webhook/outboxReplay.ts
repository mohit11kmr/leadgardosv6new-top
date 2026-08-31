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

/**
 * C4 audit fix: replays outbox events stuck in PENDING (e.g. the producing process
 * crashed between create and PUBLISHED, or the initial dispatch enqueue failed).
 * This guarantees eventual delivery instead of silently lost webhooks.
 */
export async function replayPendingOutboxEvents(
  staleAfterMs = 60_000,
  limit = 100
): Promise<number> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const pending = await db.outboxEvent.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let replayed = 0;
  for (const event of pending) {
    try {
      const payload = (event.payload as Record<string, unknown>) ?? {};
      const endpoints = await db.webhookEndpoint.findMany({
        where: { organizationId: event.organizationId, enabled: true },
      });
      const matchingEndpoints = endpoints.filter(
        (ep) => ep.events.includes(event.eventType) || ep.events.includes('*')
      );

      for (const endpoint of matchingEndpoints) {
        const deliveryId = randomUUID();
        await webhookQueue.add(
          'deliver-webhook',
          {
            deliveryId,
            webhookEndpointId: endpoint.id,
            organizationId: event.organizationId,
            eventType: event.eventType,
            url: endpoint.url,
            secretHash: endpoint.secretHash,
            payload,
            timestamp: Math.floor(Date.now() / 1000),
          },
          { jobId: `webhook_${deliveryId}` }
        );
      }

      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', processedAt: new Date() },
      });
      replayed += 1;
    } catch (error: any) {
      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED', error: error.message },
      });
    }
  }

  return replayed;
}
