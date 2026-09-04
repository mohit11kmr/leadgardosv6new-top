import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { hashPassword } from '../../apps/api/src/auth.js';

const PASSWORD = 'CorrectHorseBatteryStaple1!';

async function makePlatformUser(opts: { role?: string | null; capabilities?: string[] } = {}) {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await db.user.create({
    data: {
      email: `pf_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash,
      platformAdmin: true,
      platformRole: (opts.role ?? null) as any,
      platformCapabilities: opts.capabilities ?? [],
    },
  });
  const org = await db.organization.create({ data: { name: `Role Org ${user.id}`, slug: `role-org-${user.id}` } });
  const token = createAccessToken(user.id, org.id);
  return { user, org, token };
}

describe('Internal Platform RBAC — role/capability enforcement', () => {
  it('rejects an unauthenticated request to list platform roles', async () => {
    const res = await request(app).get('/api/v1/admin/platform-roles');
    expect(res.status).toBe(401);
  });

  it('rejects a platformAdmin with no PLATFORM_ROLE_MANAGE capability', async () => {
    const { token } = await makePlatformUser({ role: 'FINANCE' });
    const res = await request(app).get('/api/v1/admin/platform-roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('permits an OWNER to list platform users', async () => {
    const { token, user } = await makePlatformUser({ role: 'OWNER' });
    const res = await request(app).get('/api/v1/admin/platform-roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((u: any) => u.id === user.id)).toBe(true);
  });

  it('FINANCE cannot issue security actions (queue mutations)', async () => {
    const { token } = await makePlatformUser({ role: 'FINANCE' });
    const res = await request(app)
      .put('/api/v1/admin/queues/api/queues/audit/retry/failed')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('OPERATIONS cannot issue refunds', async () => {
    const { token } = await makePlatformUser({ role: 'OPERATIONS' });
    const res = await request(app)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: 'x', paymentId: 'y', amountInPaise: 100, reason: 'test', currentPassword: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('SUPPORT cannot suspend an organization (CUSTOMER_MANAGE required, SUPPORT only has CUSTOMER_VIEW/CUSTOMER_360_VIEW)', async () => {
    const { token } = await makePlatformUser({ role: 'SUPPORT' });
    const targetOrg = await db.organization.create({ data: { name: 'Support Target Org', slug: `support-target-${Date.now()}` } });
    const res = await request(app)
      .patch(`/api/v1/admin/organizations/${targetOrg.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ suspended: true, reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('ANALYST cannot perform mutations (rejected from refund issuance and queue mutation alike)', async () => {
    const { token } = await makePlatformUser({ role: 'ANALYST' });
    const refundRes = await request(app)
      .post('/api/v1/admin/refunds')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId: 'x', paymentId: 'y', amountInPaise: 100, reason: 'test', currentPassword: PASSWORD });
    expect(refundRes.status).toBe(403);

    const queueRes = await request(app)
      .put('/api/v1/admin/queues/api/queues/audit/retry/failed')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(queueRes.status).toBe(403);
  });

  it('ANALYST can view revenue and customer 360 (read-only capabilities)', async () => {
    const { token } = await makePlatformUser({ role: 'ANALYST' });
    const revenueRes = await request(app).get('/api/v1/admin/revenue/summary').set('Authorization', `Bearer ${token}`);
    expect(revenueRes.status).toBe(200);
  });

  it('OWNER can perform authorized actions across every gated surface', async () => {
    const { token } = await makePlatformUser({ role: 'OWNER' });
    const revenueRes = await request(app).get('/api/v1/admin/revenue/summary').set('Authorization', `Bearer ${token}`);
    expect(revenueRes.status).toBe(200);
    const secRes = await request(app).get('/api/v1/admin/security-events').set('Authorization', `Bearer ${token}`);
    expect(secRes.status).toBe(200);
    const opsRes = await request(app).get('/api/v1/admin/operations/summary').set('Authorization', `Bearer ${token}`);
    expect(opsRes.status).toBe(200);
  });

  it('rejects setting a role/capability without re-authentication (wrong current password)', async () => {
    const { token: ownerToken } = await makePlatformUser({ role: 'OWNER' });
    const { user: target } = await makePlatformUser({ role: null });
    const res = await request(app)
      .patch(`/api/v1/admin/platform-roles/${target.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'FINANCE', currentPassword: 'wrong-password' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REAUTH_FAILED');
  });

  it('grants a role to a platformAdmin target user, audit-logged', async () => {
    const { token: ownerToken, user: owner } = await makePlatformUser({ role: 'OWNER' });
    const { user: target } = await makePlatformUser({ role: null });

    const res = await request(app)
      .patch(`/api/v1/admin/platform-roles/${target.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'SECURITY', currentPassword: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.platformRole).toBe('SECURITY');

    const log = await db.adminAuditLog.findFirst({
      where: { userId: owner.id, action: 'PLATFORM_ROLE_CHANGED', resourceId: target.id },
    });
    expect(log).toBeTruthy();
  });

  it('rejects a non-OWNER granting the OWNER role to someone else (privilege-escalation guard)', async () => {
    const { token: financeToken } = await makePlatformUser({ role: 'FINANCE', capabilities: ['PLATFORM_ROLE_MANAGE'] });
    const { user: target } = await makePlatformUser({ role: null });

    const res = await request(app)
      .patch(`/api/v1/admin/platform-roles/${target.id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ role: 'OWNER', currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OWNER_GRANT_FORBIDDEN');
  });

  it('rejects a caller changing their own role (self-modification guard)', async () => {
    const { token, user } = await makePlatformUser({ role: 'OWNER' });
    const res = await request(app)
      .patch(`/api/v1/admin/platform-roles/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'ANALYST', currentPassword: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_MODIFICATION_FORBIDDEN');
  });

  it('rejects granting a role to a user who is not a platformAdmin', async () => {
    const { token: ownerToken } = await makePlatformUser({ role: 'OWNER' });
    const nonAdmin = await db.user.create({
      data: { email: `nonadmin_${Date.now()}@example.com`, passwordHash: await hashPassword(PASSWORD), platformAdmin: false },
    });

    const res = await request(app)
      .patch(`/api/v1/admin/platform-roles/${nonAdmin.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'ANALYST', currentPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOT_A_PLATFORM_ADMIN');
  });
});
