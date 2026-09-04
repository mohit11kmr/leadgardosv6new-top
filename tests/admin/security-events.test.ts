import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

async function makePlatformAdmin(capabilities: string[]) {
  const user = await db.user.create({
    data: { email: `sec_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`, passwordHash: 'hash', platformAdmin: true, platformCapabilities: capabilities },
  });
  const org = await db.organization.create({ data: { name: `Sec Org ${user.id}`, slug: `sec-org-${user.id}` } });
  const token = createAccessToken(user.id, org.id);
  return { user, org, token };
}

describe('GET /admin/security-events', () => {
  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/admin/security-events');
    expect(res.status).toBe(401);
  });

  it('rejects a platformAdmin without SECURITY_VIEW', async () => {
    const { token } = await makePlatformAdmin([]);
    const res = await request(app).get('/api/v1/admin/security-events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('permits a platformAdmin with SECURITY_VIEW and returns severity-classified, bounded, paginated events', async () => {
    const { user, org, token } = await makePlatformAdmin(['SECURITY_VIEW']);
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    await db.securityEvent.create({ data: { userId: user.id, type: 'LOGIN_FAILURE', ipAddress: '1.2.3.4' } });
    await db.securityEvent.create({ data: { userId: user.id, type: 'REFRESH_REUSE_DETECTED', ipAddress: '1.2.3.4' } });

    const res = await request(app).get('/api/v1/admin/security-events?limit=1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.hasMore).toBe(true);
    expect(res.body.data.items[0].severity).toBeDefined();
  });

  it('filters by organizationId without leaking another organization’s events', async () => {
    const { user: userA, org: orgA, token } = await makePlatformAdmin(['SECURITY_VIEW']);
    await db.organizationMember.create({ data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' } });
    const { user: userB, org: orgB } = await makePlatformAdmin(['SECURITY_VIEW']);
    await db.organizationMember.create({ data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' } });

    await db.securityEvent.create({ data: { userId: userA.id, type: 'LOGIN_SUCCESS' } });
    await db.securityEvent.create({ data: { userId: userB.id, type: 'LOGIN_SUCCESS' } });

    const res = await request(app)
      .get(`/api/v1/admin/security-events?organizationId=${orgA.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.every((e: any) => e.userId === userA.id)).toBe(true);
  });

  it('never exposes a passwordHash or token in event metadata (producer discipline check on classified severity)', async () => {
    const { user, org, token } = await makePlatformAdmin(['SECURITY_VIEW']);
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    await db.securityEvent.create({ data: { userId: user.id, type: 'PASSWORD_RESET_REQUEST', metadata: { email: user.email } } });

    const res = await request(app).get('/api/v1/admin/security-events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('tokenHash');
  });

  it('bounds the limit parameter to a maximum of 100', async () => {
    const { token } = await makePlatformAdmin(['SECURITY_VIEW']);
    const res = await request(app).get('/api/v1/admin/security-events?limit=99999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(100);
  });
});
