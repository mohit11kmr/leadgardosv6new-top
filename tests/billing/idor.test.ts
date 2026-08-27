import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Billing: IDOR & Cross-Tenant Boundary Protection (Requirement 19, 37)', () => {
  it('prevents Tenant B from viewing Tenant A billing data, invoices, or payments', async () => {
    // 1. Setup Tenant A with payment
    const orgA = await db.organization.create({
      data: { name: 'Tenant A Billing Org', slug: `org-a-bill-${Date.now()}` },
    });
    const userA = await db.user.create({
      data: { email: `bill_user_a_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });

    await db.payment.create({
      data: {
        organizationId: orgA.id,
        provider: 'RAZORPAY',
        providerPaymentId: `pay_a_${Date.now()}`,
        amountInPaise: 499900,
        currency: 'INR',
        status: 'CAPTURED',
        purpose: 'SUBSCRIPTION',
      },
    });

    // 2. Setup Tenant B
    const orgB = await db.organization.create({
      data: { name: 'Tenant B Billing Org', slug: `org-b-bill-${Date.now()}` },
    });
    const userB = await db.user.create({
      data: { email: `bill_user_b_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });
    const tokenB = createAccessToken(userB.id, orgB.id);

    // Tenant B queries payments -> should receive empty array, not Tenant A's payments
    const paymentsRes = await request(app)
      .get('/api/v1/billing/payments')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(paymentsRes.status).toBe(200);
    expect(paymentsRes.body.data).toHaveLength(0);

    // Tenant B queries invoices -> empty array
    const invoicesRes = await request(app)
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(invoicesRes.status).toBe(200);
    expect(invoicesRes.body.data).toHaveLength(0);
  });
});
