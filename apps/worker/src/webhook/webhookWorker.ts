import { Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '@leadguard/config';
import { db } from '@leadguard/database';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { validateExternalUrl } from '@leadguard/shared';
import { decryptSecret } from '@leadguard/shared/dist/server-only/secret-encryption.js';

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

export function verifyWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp: number,
  providedSignature: string
): boolean {
  const expected = generateWebhookSignature(rawBody, secret, timestamp);
  if (expected.length !== providedSignature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
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

  // Idempotency guard: a replayed outbox event or a re-enqueued job reusing
  // the same deliveryId must never cause a second real HTTP delivery to the
  // customer's endpoint. If we've already recorded a SUCCESS for this
  // deliveryId, short-circuit without sending.
  const existing = await db.webhookDelivery.findUnique({ where: { deliveryId } });
  if (existing?.status === 'SUCCESS') {
    return { success: true, statusCode: existing.statusCode ?? undefined, deduped: true };
  }

  const rawBody = JSON.stringify(payload);
  const secret = decryptSecret(secretHash, config.WEBHOOK_SECRET_ENCRYPTION_KEY);
  const signature = generateWebhookSignature(rawBody, secret, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  let statusCode: number | null = null;
  let responseText: string | null = null;
  let errorMsg: string | null = null;

  try {
    let currentUrl = url;
    let redirectHops = 0;
    const maxRedirects = 3;
    let finalRes: Response | null = null;

    while (redirectHops <= maxRedirects) {
      // SSRF Validation: destination URL must be validated before every request
      try {
        await validateExternalUrl(currentUrl);
      } catch (err: any) {
        errorMsg = `SSRF_BLOCKED: ${err.message}`;
        await db.webhookDelivery.upsert({
          where: { deliveryId },
          create: {
            deliveryId,
            webhookEndpointId,
            organizationId,
            event: eventType,
            payload,
            statusCode: null,
            responseBody: null,
            attempts: job.attemptsMade + 1,
            status: 'FAILED',
            errorMessage: errorMsg,
          },
          update: {
            attempts: job.attemptsMade + 1,
            status: 'FAILED',
            errorMessage: errorMsg,
          },
        });
        return { success: false, error: errorMsg };
      }

      const res = await fetch(currentUrl, {
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
        redirect: 'manual',
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (!location) {
          throw new Error(`Webhook redirect from ${currentUrl} missing Location header`);
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectHops++;
        continue;
      }

      finalRes = res;
      break;
    }

    if (!finalRes) {
      throw new Error(`Exceeded maximum redirects (${maxRedirects}) delivering webhook`);
    }

    statusCode = finalRes.status;
    responseText = (await finalRes.text()).slice(0, 1000);

    if (finalRes.ok) {
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
    }

    // Handle Client Errors (4xx non-429) vs Server/Rate-limit errors (5xx, 429)
    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
      // Non-retryable permanent client error
      errorMsg = `Permanent HTTP ${statusCode}: ${responseText}`;
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
          status: 'FAILED',
          errorMessage: errorMsg,
        },
        update: {
          statusCode,
          responseBody: responseText,
          attempts: job.attemptsMade + 1,
          status: 'FAILED',
          errorMessage: errorMsg,
        },
      });

      return { success: false, statusCode, error: errorMsg };
    }

    // 429 or 5xx: retryable error
    throw new Error(`Retryable HTTP ${statusCode}: ${responseText}`);
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
