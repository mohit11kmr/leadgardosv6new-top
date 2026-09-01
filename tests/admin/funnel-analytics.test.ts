process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL = 'redis://localhost:16380';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);
process.env.APP_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:4000';

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

// Regression for a real product gap: FunnelEvent rows were recorded by the
// guest-scan / express-fix / billing flows but nothing ever read them back
// — a write-only black hole with no way to see conversion drop-off. This
// proves the new admin endpoint turns that stored data into a real,
// non-fabricated conversion report.
describe('GET /admin/funnel-analytics', () => {
  let platformToken: string;
  let regularToken: string;
  let orgId: string;

  beforeAll(async () => {
    const platformAdmin = await db.user.create({
      data: { email: `funnel-admin-${Date.now()}@example.com`, passwordHash: 'hash', platformAdmin: true },
    });
    const adminOrg = await db.organization.create({ data: { name: 'Funnel Admin Org', slug: `funnel-admin-org-${Date.now()}` } });
    platformToken = createAccessToken(platformAdmin.id, adminOrg.id);

    const regularUser = await db.user.create({ data: { email: `funnel-regular-${Date.now()}@example.com`, passwordHash: 'hash' } });
    const regularOrg = await db.organization.create({ data: { name: 'Funnel Regular Org', slug: `funnel-regular-org-${Date.now()}` } });
    await db.organizationMember.create({ data: { organizationId: regularOrg.id, userId: regularUser.id, role: 'OWNER' } });
    regularToken = createAccessToken(regularUser.id, regularOrg.id);

    orgId = adminOrg.id;
  });

  it('rejects a non-platform-admin with 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/funnel-analytics')
      .set('Authorization', `Bearer ${regularToken}`);
    expect(res.status).toBe(403);
  });

  it('aggregates real recorded funnel events into an ordered, percentage-annotated stage list', async () => {
    // Simulate a realistic funnel: 10 started, 6 completed, 3 viewed, 1 clicked express-fix, 1 checkout, 1 paid.
    const events: Array<{ type: string; count: number }> = [
      { type: 'FREE_SCAN_STARTED', count: 10 },
      { type: 'FREE_SCAN_COMPLETED', count: 6 },
      { type: 'RESULT_VIEWED', count: 3 },
      { type: 'EXPRESS_FIX_CLICKED', count: 1 },
      { type: 'CHECKOUT_STARTED', count: 1 },
      { type: 'PAYMENT_SUCCESS', count: 1 },
      { type: 'PAYMENT_FAILED', count: 2 },
    ];
    for (const { type, count } of events) {
      await db.funnelEvent.createMany({
        data: Array.from({ length: count }, () => ({ organizationId: orgId, type })),
      });
    }

    const res = await request(app)
      .get('/api/v1/admin/funnel-analytics')
      .set('Authorization', `Bearer ${platformToken}`);

    expect(res.status).toBe(200);
    const { stages, paymentFailedCount } = res.body.data;

    const byType = Object.fromEntries(stages.map((s: any) => [s.type, s]));
    expect(byType.FREE_SCAN_STARTED.count).toBe(10);
    expect(byType.FREE_SCAN_COMPLETED.count).toBe(6);
    expect(byType.RESULT_VIEWED.count).toBe(3);
    expect(byType.PAYMENT_SUCCESS.count).toBe(1);

    // Real percentages, not fabricated: 6/10 = 60%, 1/10 = 10% (from top).
    expect(byType.FREE_SCAN_COMPLETED.conversionFromTopPct).toBe(60);
    expect(byType.PAYMENT_SUCCESS.conversionFromTopPct).toBe(10);

    expect(paymentFailedCount).toBe(2);
  });

  it('respects the from/to date range filter', async () => {
    const oldEvent = await db.funnelEvent.create({ data: { organizationId: orgId, type: 'FREE_SCAN_STARTED' } });
    await db.funnelEvent.update({
      where: { id: oldEvent.id },
      data: { createdAt: new Date('2020-01-01T00:00:00.000Z') },
    });

    const res = await request(app)
      .get('/api/v1/admin/funnel-analytics')
      .query({ from: '2021-01-01T00:00:00.000Z', to: '2021-12-31T00:00:00.000Z' })
      .set('Authorization', `Bearer ${platformToken}`);

    expect(res.status).toBe(200);
    const started = res.body.data.stages.find((s: any) => s.type === 'FREE_SCAN_STARTED');
    // The 2020 event must not be counted in a 2021-only range.
    expect(started.count).toBe(0);
  });
});
