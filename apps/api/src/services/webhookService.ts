import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '@leadguard/database';
import { outboxService, webhookQueue } from './outboxService.js';
import { randomUUID } from 'node:crypto';

export class WebhookService {
  /**
   * Generates a secure HMAC-SHA256 signature for outgoing webhook payload
   */
  generateSignature(payload: string, secret: string, timestamp: number): string {
    const signaturePayload = `${timestamp}.${payload}`;
    return createHmac('sha256', secret).update(signaturePayload).digest('hex');
  }

  /**
   * Signs a payload returning formatted X-LeadGuard-Signature header
   */
  signPayload(payload: string, secret: string, timestamp: number): string {
    const sig = this.generateSignature(payload, secret, timestamp);
    return `t=${timestamp},v1=${sig}`;
  }

  /**
   * Verifies an incoming webhook HMAC signature with timestamp replay protection (default tolerance 300s)
   */
  verifySignature(
    payload: string,
    secret: string,
    signatureHeader: string,
    timestampHeader: string | number,
    toleranceSeconds = 300
  ): boolean {
    const timestamp = typeof timestampHeader === 'string' ? Number(timestampHeader) : timestampHeader;
    if (isNaN(timestamp)) return false;

    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - timestamp) > toleranceSeconds) {
      return false; // Replay attack prevented
    }

    const expectedSignature = this.generateSignature(payload, secret, timestamp);

    try {
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      const actualBuffer = Buffer.from(signatureHeader, 'hex');
      if (expectedBuffer.length !== actualBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Registers a new webhook endpoint for an organization
   */
  async createEndpoint(
    organizationId: string,
    data: {
      url: string;
      events: string[];
      description?: string;
    }
  ) {
    const rawSecret = `whsec_${randomBytes(24).toString('hex')}`;

    const endpoint = await db.webhookEndpoint.create({
      data: {
        organizationId,
        url: data.url,
        secretHash: rawSecret,
        events: data.events.length > 0 ? data.events : ['*'],
        description: data.description,
      },
    });

    return {
      endpoint: {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        description: endpoint.description,
        enabled: endpoint.enabled,
        createdAt: endpoint.createdAt,
      },
      secret: rawSecret, // Returned strictly ONCE upon creation
    };
  }

  /**
   * Lists webhook endpoints for an organization
   */
  async listEndpoints(organizationId: string) {
    const endpoints = await db.webhookEndpoint.findMany({
      where: { organizationId },
      include: {
        deliveries: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            event: true,
            status: true,
            statusCode: true,
            attempts: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return endpoints.map((ep) => ({
      id: ep.id,
      url: ep.url,
      events: ep.events,
      description: ep.description,
      enabled: ep.enabled,
      createdAt: ep.createdAt,
      recentDeliveries: ep.deliveries,
    }));
  }

  /**
   * Deletes a webhook endpoint
   */
  async deleteEndpoint(organizationId: string, id: string) {
    const res = await db.webhookEndpoint.deleteMany({
      where: { id, organizationId },
    });
    return res.count > 0;
  }

  /**
   * Sends a test ping to a webhook endpoint
   */
  async sendTestPing(organizationId: string, id: string) {
    const endpoint = await db.webhookEndpoint.findFirst({
      where: { id, organizationId },
    });

    if (!endpoint) {
      const err = new Error('Webhook endpoint not found');
      (err as unknown as { code: string }).code = 'NOT_FOUND';
      throw err;
    }

    const deliveryId = randomUUID();
    const payload = {
      event: 'PING',
      message: 'LeadGuard OS V6 Webhook Test Ping',
      timestamp: new Date().toISOString(),
    };

    await webhookQueue.add(
      'deliver-webhook',
      {
        deliveryId,
        webhookEndpointId: endpoint.id,
        organizationId,
        eventType: 'PING',
        url: endpoint.url,
        secretHash: endpoint.secretHash,
        payload,
        timestamp: Math.floor(Date.now() / 1000),
      },
      { jobId: `ping_${deliveryId}` }
    );

    return { success: true, deliveryId };
  }
}

export const webhookService = new WebhookService();
