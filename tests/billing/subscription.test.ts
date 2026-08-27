import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Billing: Subscription Lifecycle & Cancellation (Requirement 9, 11, 38)', () => {
  it('subscribes organization to Pro plan, upgrades entitlements, and supports cancellation', async () => {
    const org = await db.organization.create({
      data: { name: 'Sub Org', slug: `sub-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `sub_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    // 1. Subscribe to PRO plan
    const subRes = await request(app)
      .post('/api/v1/billing/checkout/subscription')
      .set('Authorization', `Bearer ${token}`)
      .send({ planCode: 'PRO' });

    expect(subRes.status).toBe(201);
    expect(subRes.body.success).toBe(true);
    expect(subRes.body.data.plan.code).toBe('PRO');
    expect(subRes.body.data.subscription.status).toBe('ACTIVE');

    // 2. Fetch billing overview
    const overviewRes = await request(app)
      .get('/api/v1/billing')
      .set('Authorization', `Bearer ${token}`);

    expect(overviewRes.status).toBe(200);
    expect(overviewRes.body.data.currentPlan.code).toBe('PRO');
    expect(overviewRes.body.data.subscription.status).toBe('ACTIVE');

    // 3. Cancel Subscription
    const cancelRes = await request(app)
      .post('/api/v1/billing/subscription/cancel')
      .set('Authorization', `Bearer ${token}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.cancelAtPeriodEnd).toBe(true);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });
});
