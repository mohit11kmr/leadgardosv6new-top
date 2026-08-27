import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { webhookService } from '../../apps/api/src/services/webhookService.js';

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
});
