import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { processWebhookDelivery } from '../../apps/worker/src/webhook/webhookWorker.js';

describe('Webhook SSRF & Redirect Protection Gate (Requirement 26, 27)', () => {
  let user: any;
  let org: any;
  let authToken: string;
  let endpoint: any;
  let oldAllowFixtures: string | undefined;

  beforeEach(async () => {
    oldAllowFixtures = process.env.ALLOW_LOCAL_FIXTURES;
    delete process.env.ALLOW_LOCAL_FIXTURES;

    user = await db.user.create({
      data: { email: `wh-ssrf-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Webhook SSRF Org', slug: `wh-ssrf-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    authToken = createAccessToken(user.id, org.id);

    endpoint = await db.webhookEndpoint.create({
      data: {
        organizationId: org.id,
        url: 'https://example.com/webhook',
        secretHash: 'whsec_test',
        events: ['*'],
      },
    });
  });

  afterEach(() => {
    if (oldAllowFixtures !== undefined) {
      process.env.ALLOW_LOCAL_FIXTURES = oldAllowFixtures;
    }
  });

  it('rejects registration of webhook endpoints targeting private/localhost/metadata IPs', async () => {
    const targets = [
      'http://localhost:9000/webhook',
      'http://127.0.0.1:8080/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.5/receiver',
      'http://192.168.1.100/webhook',
    ];

    for (const url of targets) {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ url, events: ['*'] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_URL');
    }
  });

  it('fails webhook delivery worker safely when destination resolves to blocked IP without throwing unhandled error', async () => {
    const fakeJob: any = {
      data: {
        deliveryId: `del-${Date.now()}`,
        webhookEndpointId: endpoint.id,
        organizationId: org.id,
        eventType: 'AUDIT_COMPLETED',
        url: 'http://169.254.169.254/webhook',
        secretHash: 'whsec_test',
        payload: { test: true },
        timestamp: Math.floor(Date.now() / 1000),
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const result = await processWebhookDelivery(fakeJob);
    expect(result.success).toBe(false);
    expect(result.error).toContain('SSRF_BLOCKED');

    const deliveryRecord = await db.webhookDelivery.findUnique({
      where: { deliveryId: fakeJob.data.deliveryId },
    });
    expect(deliveryRecord?.status).toBe('FAILED');
    expect(deliveryRecord?.errorMessage).toContain('SSRF_BLOCKED');
  });
});
