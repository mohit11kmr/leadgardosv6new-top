import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Watchdog Security: Route Hardening, Cross-Monitor IDOR & Entitlement Protection (Requirement 17, 18, 19, 22)', () => {
  it('prevents cross-monitor alert acknowledgment IDOR even within same organization', async () => {
    const org = await db.organization.create({
      data: { name: 'IDOR Org', slug: `idor-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `idor_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    await db.subscription.create({
      data: { organizationId: org.id, planId: proPlan!.id, status: 'ACTIVE' },
    });

    const siteA = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Site A',
        url: 'https://site-a-idor.test',
        normalizedUrl: 'https://site-a-idor.test',
        domain: 'site-a-idor.test',
      },
    });
    const siteB = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Site B',
        url: 'https://site-b-idor.test',
        normalizedUrl: 'https://site-b-idor.test',
        domain: 'site-b-idor.test',
      },
    });

    const monitorA = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: siteA.id, frequency: 'HOURLY' },
    });
    const monitorB = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: siteB.id, frequency: 'HOURLY' },
    });

    // Alert belonging to Monitor A
    const alertA = await db.monitoringAlert.create({
      data: {
        organizationId: org.id,
        monitoringConfigId: monitorA.id,
        fingerprint: `fp_a_${Date.now()}`,
        title: 'Monitor A Alert',
        message: 'Alert text',
        status: 'OPEN',
      },
    });

    // Attempting to acknowledge Alert A through Monitor B's URL path -> Must fail!
    const ackRes = await request(app)
      .post(`/api/v1/monitoring/${monitorB.id}/alerts/${alertA.id}/ack`)
      .set('Authorization', `Bearer ${token}`);

    expect(ackRes.status).toBe(500);

    // Acknowledging Alert A through Monitor A's URL path -> Must succeed!
    const validAckRes = await request(app)
      .post(`/api/v1/monitoring/${monitorA.id}/alerts/${alertA.id}/ack`)
      .set('Authorization', `Bearer ${token}`);

    expect(validAckRes.status).toBe(200);
    expect(validAckRes.body.data.status).toBe('ACKNOWLEDGED');
  });

  it('prevents bypassing frequency entitlements via PATCH', async () => {
    const org = await db.organization.create({
      data: { name: 'Patch Org', slug: `patch-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `patch_user_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const token = createAccessToken(user.id, org.id);

    // PRO plan allows HOURLY / 15_MINUTES, but FIVE_MINUTES is restricted to AGENCY
    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    await db.subscription.create({
      data: { organizationId: org.id, planId: proPlan!.id, status: 'ACTIVE' },
    });

    const site = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Site Pro',
        url: 'https://site-pro.test',
        normalizedUrl: 'https://site-pro.test',
        domain: 'site-pro.test',
      },
    });

    const monitor = await db.monitoringConfig.create({
      data: { organizationId: org.id, websiteId: site.id, frequency: 'HOURLY' },
    });

    // Attempting to PATCH frequency to FIVE_MINUTES on PRO plan -> 403 PLAN_LIMIT_REACHED
    const patchRes = await request(app)
      .patch(`/api/v1/monitoring/${monitor.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ frequency: 'FIVE_MINUTES' });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('enforces plan resource caps on maxPages when creating a monitor', async () => {
    const org = await db.organization.create({
      data: { name: 'Cap Org', slug: `cap-org-${Date.now()}` },
    });
    const user = await db.user.create({
      data: { email: `cap_user_${Date.now()}@example.com`, passwordHash: 'hash' },
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
        name: 'Site Cap',
        url: 'https://site-cap.test',
        normalizedUrl: 'https://site-cap.test',
        domain: 'site-cap.test',
      },
    });

    // PRO plan caps maxPages at 10; requesting 100 pages must be clamped to 10
    const createRes = await request(app)
      .post('/api/v1/monitoring')
      .set('Authorization', `Bearer ${token}`)
      .send({ websiteId: site.id, maxPages: 50, frequency: 'HOURLY' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.maxPages).toBe(10);
  });
});
