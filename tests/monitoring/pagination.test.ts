import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Watchdog API: Cursor-Based Pagination (Requirement 23, 29)', () => {
  it('paginates monitoring runs and findings with cursor and limit', async () => {
    const org = await db.organization.create({
      data: { name: 'Page Org', slug: `page-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `page_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    await db.subscription.create({
      data: { organizationId: org.id, planId: proPlan!.id, status: 'ACTIVE' },
    });

    const site = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Site Page',
        url: 'https://site-page.test',
        normalizedUrl: 'https://site-page.test',
        domain: 'site-page.test',
      },
    });

    const monitor = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: site.id, frequency: 'HOURLY' },
    });

    // Create 5 runs
    for (let i = 0; i < 5; i++) {
      await db.monitoringRun.create({
        data: {
          monitoringConfigId: monitor.id,
          websiteId: site.id,
          organizationId: org.id,
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - i * 60_000),
        },
      });
    }

    // Query Page 1 with limit=2
    const page1Res = await request(app)
      .get(`/api/v1/monitoring/${monitor.id}/runs?limit=2`)
      .set('Authorization', `Bearer ${token}`);

    expect(page1Res.status).toBe(200);
    expect(page1Res.body.data.length).toBe(2);
    expect(page1Res.body.meta.hasNextPage).toBe(true);
    expect(page1Res.body.meta.nextCursor).toBeDefined();

    // Query Page 2 with nextCursor
    const page2Res = await request(app)
      .get(`/api/v1/monitoring/${monitor.id}/runs?limit=2&cursor=${page1Res.body.meta.nextCursor}`)
      .set('Authorization', `Bearer ${token}`);

    expect(page2Res.status).toBe(200);
    expect(page2Res.body.data.length).toBe(2);
    expect(page2Res.body.data[0].id).not.toEqual(page1Res.body.data[0].id);
  });
});
