import { db } from '@leadguard/database';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { randomUUID } from 'node:crypto';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export const webhookQueue = new Queue('webhook', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export type OutboxEventType =
  | 'AUDIT_COMPLETED'
  | 'AUDIT_FAILED'
  | 'MONITORING_ALERT'
  | 'MONITORING_RESOLVED'
  | 'REPORT_READY'
  | 'PAYMENT_SUCCEEDED'
  | 'SUBSCRIPTION_CHANGED'
  | 'VAULT_AUDIT_COMPLETED'
  | 'VAULT_REPORT_READY';

export class OutboxService {
  /**
   * Emits a domain event through the transactional outbox table and dispatches to webhooks
   */
  async emitEvent(
    organizationId: string,
    eventType: OutboxEventType,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>
  ) {
    const event = await db.outboxEvent.create({
      data: {
        organizationId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
        status: 'PENDING',
      },
    });

    await this.dispatchEvent(event.id, organizationId, eventType, payload, event.status);

    return event;
  }

  /**
   * Finds enabled webhook endpoints matching an event type, enqueues delivery jobs,
   * and marks the outbox event PUBLISHED. Idempotent with respect to `status` so a
   * replay never re-dispatches an already-PUBLISHED event.
   */
  async dispatchEvent(
    eventId: string,
    organizationId: string,
    eventType: string,
    payload: Record<string, any>,
    currentStatus: string
  ) {
    if (currentStatus === 'PUBLISHED') {
      return;
    }

    // Find all matching enabled webhook endpoints
    const endpoints = await db.webhookEndpoint.findMany({
      where: {
        organizationId,
        enabled: true,
      },
    });

    const matchingEndpoints = endpoints.filter(
      (ep) => ep.events.includes(eventType) || ep.events.includes('*')
    );

    for (const endpoint of matchingEndpoints) {
      const deliveryId = randomUUID();
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
        {
          jobId: `webhook_${deliveryId}`,
        }
      );
    }

    await db.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: 'PUBLISHED',
        processedAt: new Date(),
      },
    });
  }
}

export const outboxService = new OutboxService();
