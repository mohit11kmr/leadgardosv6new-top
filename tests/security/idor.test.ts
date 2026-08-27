import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Security: IDOR & Strict Tenant Isolation (Requirement 18, 19)', () => {
  it('prevents Tenant B from viewing, updating, or deleting Tenant A resources', async () => {
    // 1. Setup Tenant A
    const orgA = await db.organization.create({
      data: { name: 'Tenant A Org', slug: `tenant-a-${Date.now()}` },
    });
    const userA = await db.user.create({
      data: { email: `user_a_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgA.id, userId: userA.id, role: 'OWNER' },
    });

    const websiteA = await db.website.create({
      data: {
        organizationId: orgA.id,
        name: 'Tenant A Secret Website',
        url: 'https://tenant-a.example.com',
        normalizedUrl: 'https://tenant-a.example.com',
        domain: 'tenant-a.example.com',
      },
    });

    const auditA = await db.audit.create({
      data: {
        organizationId: orgA.id,
        websiteId: websiteA.id,
        status: 'COMPLETED',
      },
    });

    // 2. Setup Tenant B (Attacker)
    const orgB = await db.organization.create({
      data: { name: 'Tenant B Org', slug: `tenant-b-${Date.now()}` },
    });
    const userB = await db.user.create({
      data: { email: `user_b_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: orgB.id, userId: userB.id, role: 'OWNER' },
    });
    const tokenB = createAccessToken(userB.id, orgB.id);

    // --- IDOR Attack Suite ---
    // Attack 1: GET Website A -> 404 NOT_FOUND
    const getSiteRes = await request(app)
      .get(`/api/v1/websites/${websiteA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getSiteRes.status).toBe(404);

    // Attack 2: PATCH Website A -> 404 NOT_FOUND
    const patchSiteRes = await request(app)
      .patch(`/api/v1/websites/${websiteA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hacked Name', url: 'https://hacked.com' });
    expect(patchSiteRes.status).toBe(404);

    // Attack 3: DELETE Website A -> 404 NOT_FOUND
    const deleteSiteRes = await request(app)
      .delete(`/api/v1/websites/${websiteA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(deleteSiteRes.status).toBe(404);

    // Attack 4: GET Audit A -> 404 NOT_FOUND
    const getAuditRes = await request(app)
      .get(`/api/v1/audits/${auditA.id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getAuditRes.status).toBe(404);

    // Attack 5: POST Cancel Audit A -> 404 NOT_FOUND
    const cancelAuditRes = await request(app)
      .post(`/api/v1/audits/${auditA.id}/cancel`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(cancelAuditRes.status).toBe(404);

    // Attack 6: GET Audit Findings -> 404 NOT_FOUND
    const getFindingsRes = await request(app)
      .get(`/api/v1/audits/${auditA.id}/findings`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getFindingsRes.status).toBe(404);

    // Attack 7: GET Audit Pages -> 404 NOT_FOUND
    const getPagesRes = await request(app)
      .get(`/api/v1/audits/${auditA.id}/pages`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(getPagesRes.status).toBe(404);
  });
});
