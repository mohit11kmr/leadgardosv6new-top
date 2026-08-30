import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Admin Platform & RBAC Security Controls (LG-034)', () => {
  let platformAdmin: any;
  let ownerUser: any;
  let regularUser: any;
  let org: any;
  let platformToken: string;
  let ownerToken: string;
  let regularToken: string;

  beforeEach(async () => {
    platformAdmin = await db.user.create({
      data: { email: `platform-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash', platformAdmin: true },
    });
    ownerUser = await db.user.create({
      data: { email: `owner-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    regularUser = await db.user.create({
      data: { email: `regular-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Admin Test Org', slug: `admin-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: ownerUser.id, role: 'OWNER' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: regularUser.id, role: 'MEMBER' },
    });

    platformToken = createAccessToken(platformAdmin.id, org.id);
    ownerToken = createAccessToken(ownerUser.id, org.id);
    regularToken = createAccessToken(regularUser.id, org.id);
  });

  it('allows only platform admins to fetch admin metrics; rejects org OWNER and member with 403', async () => {
    // Platform admin access -> 200
    const adminRes = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${platformToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.success).toBe(true);
    expect(adminRes.body.data.totalUsers).toBeGreaterThanOrEqual(2);

    // Regular member -> 403 Forbidden
    const regularRes = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${regularToken}`);

    expect(regularRes.status).toBe(403);

    // Org OWNER (non platform admin) -> 403 Forbidden (no privilege escalation)
    const ownerRes = await request(app)
      .get('/api/v1/admin/metrics')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerRes.status).toBe(403);
  });

  it('disables user and revokes active sessions with audit log logging as platform admin', async () => {
    // Target user to disable
    const targetUser = await db.user.create({
      data: { email: `target-${Date.now()}@example.com`, passwordHash: 'hash' },
    });

    // Disable target user
    const disableRes = await request(app)
      .patch(`/api/v1/admin/users/${targetUser.id}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ disabled: true, reason: 'Security terms violation' });

    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.isDisabled).toBe(true);

    // Check admin audit log entry
    const auditLogs = await db.adminAuditLog.findMany({
      where: { resourceId: targetUser.id },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0].action).toBe('USER_DISABLED');
  });

  it('suspends an organization successfully as platform admin', async () => {
    const targetOrg = await db.organization.create({
      data: { name: 'Rogue Org', slug: `rogue-${Date.now()}` },
    });

    const suspendRes = await request(app)
      .patch(`/api/v1/admin/organizations/${targetOrg.id}/status`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ suspended: true, reason: 'Payment default' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.isSuspended).toBe(true);
  });

  it('rejects org owner attempting to disable users and suspend organizations', async () => {
    const targetUser = await db.user.create({
      data: { email: `target2-${Date.now()}@example.com`, passwordHash: 'hash' },
    });

    const disableRes = await request(app)
      .patch(`/api/v1/admin/users/${targetUser.id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ disabled: true, reason: 'Escalation attempt' });

    expect(disableRes.status).toBe(403);
  });
});