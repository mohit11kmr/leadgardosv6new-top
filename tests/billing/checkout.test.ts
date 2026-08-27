import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { razorpayProvider } from '../../apps/api/src/billing/razorpayProvider.js';

describe('Billing: Express Fix Checkout & Verification (Requirement 10, 13, 38)', () => {
  it('creates Express Fix order, verifies server-side HMAC signature, and rejects duplicate payments', async () => {
    // 1. Setup Organization & Owner
    const org = await db.organization.create({
      data: { name: 'Express Fix Org', slug: `ef-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `ef_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Target Site',
        url: 'https://express-target.test',
        normalizedUrl: 'https://express-target.test',
        domain: 'express-target.test',
      },
    });

    // 2. Initiate Express Fix Checkout
    const orderRes = await request(app)
      .post('/api/v1/billing/checkout/express-fix')
      .set('Authorization', `Bearer ${token}`)
      .send({ websiteId: website.id });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.success).toBe(true);
    expect(orderRes.body.data.amount).toBe(299900); // ₹2,999
    expect(orderRes.body.data.currency).toBe('INR');
    const orderId = orderRes.body.data.orderId;
    expect(orderId).toBeDefined();

    // 3. Attempt verification with invalid signature -> Fails (400 / 500)
    const invalidVerifyRes = await request(app)
      .post('/api/v1/billing/checkout/express-fix/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        paymentId: `pay_${Date.now()}`,
        signature: 'invalid_signature_hex',
        websiteId: website.id,
      });

    expect(invalidVerifyRes.status).toBe(500);

    // 4. Verify with valid HMAC-SHA256 signature -> Succeeds (200)
    const paymentId = `pay_${Date.now()}`;
    const validSignature = razorpayProvider.generateTestPaymentSignature(orderId, paymentId);

    const verifyRes = await request(app)
      .post('/api/v1/billing/checkout/express-fix/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        paymentId,
        signature: validSignature,
        websiteId: website.id,
      });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.payment.amountInPaise).toBe(299900);
    expect(verifyRes.body.data.payment.status).toBe('CAPTURED');
    expect(verifyRes.body.data.invoice.invoiceNumber).toBeDefined();

    // 5. Re-sending identical paymentId is detected as duplicate
    const duplicateRes = await request(app)
      .post('/api/v1/billing/checkout/express-fix/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        paymentId,
        signature: validSignature,
        websiteId: website.id,
      });

    expect(duplicateRes.status).toBe(200);
    expect(duplicateRes.body.data.duplicate).toBe(true);
  });
});
