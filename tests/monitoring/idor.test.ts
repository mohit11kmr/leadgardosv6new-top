import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Watchdog Monitoring: IDOR & Tenant Boundary Isolation (Requirement 27, 38)', () => {
  it('prevents Tenant B from viewing, modifying, or triggering runs on Tenant A monitors', async () => {
    // 1. Setup Tenant A with PRO subscription and Monitor
    const orgA = await db.organization.create({
      data: { name: 'Tenant A Org', slug: `org-a-mon-${Date.now()}` },
    });
    const userA = await db.user.create({
      data: { email: `mon_a_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });
    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    await db.subscription.create({
      data: { organizationId: orgA.id, planId: proPlan!.id, status: 'ACTIVE' },
    });

    const websiteA = await db.website.create({
      data: {
        organizationId: orgA.id,
        name: 'Site A',
        url: 'https://site-a.test',
        normalizedUrl: 'https://site-a.test',
        domain: 'site-a.test',
      },
    });

    const monitorA = await db.monitoringConfig.create({
      data: {
        organizationId: orgA.id,
        websiteId: websiteA.id,
        frequency: 'HOURLY',
      },
    });

    // 2. Setup Tenant B
    const orgB = await db.organization.create({
      data: { name: 'Tenant B Org', slug: `org-b-mon-${Date.now()}` },
    });
    const userB = await db.user.create({
      data: { email: `mon_b_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });
    const tokenB = createAccessToken(userB.id, orgB.id);

    // Tenant B GET Monitor A -> 404
    const getRes = await request(app)
      .get(`/api/v1/monitoring/${monitorA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(getRes.status).toBe(404);

    // Tenant B PATCH Monitor A -> 500 / 404
    const patchRes = await request(app)
      .patch(`/api/v1/monitoring/${monitorA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ frequency: 'DAILY' });

    expect([404, 500]).toContain(patchRes.status);

    // Tenant B Manual Run on Monitor A -> 500 / 404
    const runRes = await request(app)
      .post(`/api/v1/monitoring/${monitorA.id}/run`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect([404, 500]).toContain(runRes.status);
  });
});
