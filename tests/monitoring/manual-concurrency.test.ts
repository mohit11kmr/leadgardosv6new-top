import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Watchdog Reliability: Manual Run Concurrency & Idempotency (Requirement 6, 21)', () => {
  it('handles 10 rapid simultaneous Run Now requests: exactly 1 active execution, others return 409 MONITOR_RUN_IN_PROGRESS', async () => {
    const org = await db.organization.create({
      data: { name: 'Manual Concurrency Org', slug: `man-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `man_user_${Date.now()}@example.com`, passwordHash: 'hash' },
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
        name: 'Site Manual Concurrency',
        url: 'https://site-man-conc.test',
        normalizedUrl: 'https://site-man-conc.test',
        domain: 'site-man-conc.test',
      },
    });

    const monitor = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: site.id, frequency: 'HOURLY' },
    });

    // Fire 10 simultaneous manual Run Now requests
    const promises = Array.from({ length: 10 }, () =>
      request(app)
        .post(`/api/v1/monitoring/${monitor.id}/run`)
        .set('Authorization', `Bearer ${token}`)
    );

    const responses = await Promise.all(promises);

    const successfulRuns = responses.filter((r) => r.status === 202);
    const inProgressRuns = responses.filter(
      (r) => r.status === 409 && r.body.error?.code === 'MONITOR_RUN_IN_PROGRESS'
    );

    // Exactly 1 request successfully enqueues
    expect(successfulRuns.length).toBe(1);
    expect(successfulRuns[0]?.body.data.enqueued).toBe(true);

    // Remaining 9 requests receive 409 MONITOR_RUN_IN_PROGRESS
    expect(inProgressRuns.length).toBe(9);
  }, 15000);
});
