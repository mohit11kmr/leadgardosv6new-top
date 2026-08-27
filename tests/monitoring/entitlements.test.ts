import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Watchdog Monitoring: Entitlement Enforcement (Requirement 7, 37, 41)', () => {
  it('blocks monitor creation on FREE tier with PLAN_LIMIT_REACHED and permits on PRO tier', async () => {
    // 1. Setup Free tier organization
    const org = await db.organization.create({
      data: { name: 'Free Monitoring Org', slug: `free-mon-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `free_mon_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const freeToken = createAccessToken(user.id, org.id);

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Target Site',
        url: 'https://mon-target.test',
        normalizedUrl: 'https://mon-target.test',
        domain: 'mon-target.test',
      },
    });

    // 2. Attempt monitor creation on Free Tier -> 403 PLAN_LIMIT_REACHED
    const blockedRes = await request(app)
      .post('/api/v1/monitoring')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ websiteId: website.id });

    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('PLAN_LIMIT_REACHED');

    // 3. Upgrade Org to PRO Plan
    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: proPlan!.id,
        status: 'ACTIVE',
      },
    });

    // 4. Attempt monitor creation on Pro Tier -> 201 Created
    const successRes = await request(app)
      .post('/api/v1/monitoring')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ websiteId: website.id, frequency: 'HOURLY' });

    expect(successRes.status).toBe(201);
    expect(successRes.body.data.enabled).toBe(true);
    expect(successRes.body.data.frequency).toBe('HOURLY');
  });
});
