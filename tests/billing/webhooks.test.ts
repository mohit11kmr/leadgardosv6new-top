import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { razorpayProvider } from '../../apps/api/src/billing/razorpayProvider.js';

describe('Billing: Webhook HMAC Signature & Idempotency (Requirement 14, 15, 38)', () => {
  it('verifies valid HMAC webhook signatures and ignores duplicate deliveries', async () => {
    const org = await db.organization.create({
      data: { name: 'Webhook Org', slug: `wh-org-${Date.now()}` },
    });

    const eventPayload = {
      id: `evt_${Date.now()}`,
      event: 'payment.captured',
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: `pay_${Date.now()}`,
            amount: 499900,
            currency: 'INR',
            status: 'captured',
            notes: { organizationId: org.id },
          },
        },
      },
    };

    const rawBody = JSON.stringify(eventPayload);
    const validSignature = razorpayProvider.generateTestWebhookSignature(rawBody);

    // 1. Send with invalid signature -> 400
    const invalidRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', 'invalid_signature_hex')
      .send(eventPayload);

    expect(invalidRes.status).toBe(400);

    // 2. Send with valid signature -> 200
    const validRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', validSignature)
      .send(eventPayload);

    expect(validRes.status).toBe(200);
    expect(validRes.body.success).toBe(true);
    expect(validRes.body.data.duplicate).toBe(false);

    // 3. Re-delivery of same event (Idempotency) -> 200 acknowledged with duplicate: true
    const reDeliveryRes = await request(app)
      .post('/api/v1/webhooks/razorpay')
      .set('x-razorpay-signature', validSignature)
      .send(eventPayload);

    expect(reDeliveryRes.status).toBe(200);
    expect(reDeliveryRes.body.data.duplicate).toBe(true);
  });
});
