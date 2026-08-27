import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';

describe('Developer API Keys & Scoped Least Privilege (LG-033)', () => {
  let user: any;
  let org: any;
  let token: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `apikey-test-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Dev Org', slug: `dev-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    const proPlan = await db.plan.findUnique({ where: { code: 'PRO' } });
    if (proPlan) {
      await db.subscription.create({
        data: {
          organizationId: org.id,
          planId: proPlan.id,
          status: 'ACTIVE',
        },
      });
    }
    token = createAccessToken(user.id, org.id);
  });

  it('generates an API key, hashes the secret in DB, and enforces scoped least privilege', async () => {
    const res = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'CI/CD Read Key',
        scopes: ['AUDIT_READ', 'REPORT_READ'],
        expiresInDays: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.rawKey).toMatch(/^lg_live_/);
    expect(res.body.data.apiKey.scopes).toEqual(['AUDIT_READ', 'REPORT_READ']);

    const rawKey = res.body.data.rawKey;

    // Verify key hash in DB
    const dbKey = await db.apiKey.findFirst({ where: { organizationId: org.id } });
    expect(dbKey?.keyHash).not.toBe(rawKey);

    // Verify authentication with valid scope
    const authValid = await apiKeyService.verifyApiKey(rawKey);
    expect(authValid).not.toBeNull();
    expect(authValid?.organizationId).toBe(org.id);
    expect(authValid?.scopes.includes('AUDIT_READ')).toBe(true);
    expect(authValid?.scopes.includes('AUDIT_RUN')).toBe(false);
  });

  it('revokes an API key successfully and rejects further requests', async () => {
    const { apiKey, rawKey } = await apiKeyService.createApiKey(
      org.id,
      user.id,
      'Temporary Key',
      ['AUDIT_READ']
    );

    const deleteRes = await request(app)
      .delete(`/api/v1/api-keys/${apiKey.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);

    // Verify rejection
    const postRevoke = await apiKeyService.verifyApiKey(rawKey);
    expect(postRevoke).toBeNull();
  });
});
