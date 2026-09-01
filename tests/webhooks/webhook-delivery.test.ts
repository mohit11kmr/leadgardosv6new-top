import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { webhookService } from '../../apps/api/src/services/webhookService.js';
import { decryptSecret } from '@leadguard/shared/dist/server-only/secret-encryption.js';
import { processWebhookDelivery } from '../../apps/worker/src/webhook/webhookWorker.js';

describe('Webhooks & HMAC-SHA256 Delivery (LG-019)', () => {
  let user: any;
  let org: any;
  let token: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `webhook-test-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Webhook Org', slug: `webhook-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    token = createAccessToken(user.id, org.id);
  });

  it('registers a webhook endpoint, stores secret encrypted/hashed, and handles test ping', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        url: 'https://webhook.site/test-receiver',
        events: ['AUDIT_COMPLETED', 'REPORT_READY'],
        description: 'Test Webhook Endpoint',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.endpoint.id).toBeDefined();
    expect(res.body.data.secret).toMatch(/^whsec_/);

    const endpointId = res.body.data.endpoint.id;

    // Regression: the DB column is misleadingly named "secretHash" but must
    // be recoverable to sign outgoing webhooks (it can't be a one-way hash
    // like a password). It must be encrypted at rest, not stored as the raw
    // secret returned to the client above.
    const stored = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } });
    expect(stored.secretHash).not.toBe(res.body.data.secret);
    expect(stored.secretHash.startsWith('v1:')).toBe(true);
    expect(decryptSecret(stored.secretHash, process.env.WEBHOOK_SECRET_ENCRYPTION_KEY!)).toBe(
      res.body.data.secret
    );

    // Send test ping
    const pingRes = await request(app)
      .post(`/api/v1/webhooks/${endpointId}/ping`)
      .set('Authorization', `Bearer ${token}`);

    expect(pingRes.status).toBe(200);
    expect(pingRes.body.success).toBe(true);
    expect(pingRes.body.data.deliveryId).toBeDefined();
  });

  it('generates cryptographic HMAC signatures correctly', () => {
    const payload = JSON.stringify({ event: 'AUDIT_COMPLETED', auditId: '123' });
    const secret = 'whsec_testsecret123';
    const timestamp = Math.floor(Date.now() / 1000);

    const signature = webhookService.signPayload(payload, secret, timestamp);
    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(signature).toContain(`t=${timestamp}`);
  });

  describe('delivery idempotency (a replayed/duplicated job must never re-send)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('skips the actual HTTP request when a WebhookDelivery for this deliveryId is already SUCCESS', async () => {
      const endpoint = await db.webhookEndpoint.create({
        data: {
          organizationId: org.id,
          url: 'https://example.test/webhook',
          secretHash: 'v1:should-not-be-used-because-request-is-skipped',
          events: ['*'],
        },
      });
      const deliveryId = `dedup-test-${Date.now()}`;
      await db.webhookDelivery.create({
        data: {
          deliveryId,
          webhookEndpointId: endpoint.id,
          organizationId: org.id,
          event: 'PING',
          payload: { hello: 'world' },
          status: 'SUCCESS',
          statusCode: 200,
          deliveredAt: new Date(),
        },
      });

      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const result = await processWebhookDelivery({
        data: {
          deliveryId,
          webhookEndpointId: endpoint.id,
          organizationId: org.id,
          eventType: 'PING',
          url: endpoint.url,
          secretHash: endpoint.secretHash,
          payload: { hello: 'world' },
          timestamp: Math.floor(Date.now() / 1000),
        },
        attemptsMade: 0,
        opts: { attempts: 5 },
      } as any);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect((result as any).deduped).toBe(true);
      expect((result as any).success).toBe(true);
    });
  });
});
