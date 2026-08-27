import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { db } from '@leadguard/database';
import { createHmac } from 'node:crypto';

const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });

export interface WebhookJobData {
  deliveryId: string;
  webhookEndpointId: string;
  organizationId: string;
  eventType: string;
  url: string;
  secretHash: string;
  payload: Record<string, any>;
  timestamp: number;
}

export function generateWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp: number
): string {
  const payloadToSign = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secret).update(payloadToSign).digest('hex');
}

export async function processWebhookDelivery(job: Job<WebhookJobData>) {
  const {
    deliveryId,
    webhookEndpointId,
    organizationId,
    eventType,
    url,
    secretHash,
    payload,
    timestamp,
  } = job.data;

  const rawBody = JSON.stringify(payload);
  const signature = generateWebhookSignature(rawBody, secretHash, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LeadGuard-Webhook/6.0',
        'X-LeadGuard-Event': eventType,
        'X-LeadGuard-Delivery-Id': deliveryId,
        'X-LeadGuard-Timestamp': timestamp.toString(),
        'X-LeadGuard-Signature': `t=${timestamp},v1=${signature}`,
      },
      body: rawBody,
      signal: controller.signal,
    });

    statusCode = res.status;
    responseText = (await res.text()).slice(0, 1000);

    if (!res.ok) {
      throw new Error(`Webhook endpoint returned HTTP ${res.status}`);
    }

    await db.webhookDelivery.upsert({
      where: { deliveryId },
      create: {
        deliveryId,
        webhookEndpointId,
        organizationId,
        event: eventType,
        payload,
        statusCode,
        responseBody: responseText,
        attempts: job.attemptsMade + 1,
        status: 'SUCCESS',
        deliveredAt: new Date(),
      },
      update: {
        statusCode,
        responseBody: responseText,
        attempts: job.attemptsMade + 1,
        status: 'SUCCESS',
        deliveredAt: new Date(),
      },
    });

    return { success: true, statusCode };
  } catch (error: any) {
    errorMsg = error.message;

    await db.webhookDelivery.upsert({
      where: { deliveryId },
      create: {
        deliveryId,
        webhookEndpointId,
        organizationId,
        event: eventType,
        payload,
        statusCode,
        responseBody: responseText,
        attempts: job.attemptsMade + 1,
        status: job.attemptsMade + 1 >= (job.opts.attempts || 5) ? 'FAILED' : 'RETRYING',
        errorMessage: errorMsg,
      },
      update: {
        statusCode,
        responseBody: responseText,
        attempts: job.attemptsMade + 1,
        status: job.attemptsMade + 1 >= (job.opts.attempts || 5) ? 'FAILED' : 'RETRYING',
        errorMessage: errorMsg,
      },
    });

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const webhookWorker = new Worker<WebhookJobData>(
  'webhook',
  async (job) => {
    return processWebhookDelivery(job);
  },
  {
    connection,
    concurrency: 5,
  }
);

webhookWorker.on('failed', (job, err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      service: 'worker',
      event: 'webhook_delivery_failed',
      jobId: job?.id,
      deliveryId: job?.data.deliveryId,
      url: job?.data.url,
      attempts: job?.attemptsMade,
      error: err.message,
    })
  );
});
