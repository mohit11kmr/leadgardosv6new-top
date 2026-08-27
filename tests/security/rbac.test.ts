import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { db } from '@leadguard/database';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';

describe('Security: RBAC Permission Matrix (Requirement 20, 23)', () => {
  it('enforces distinct permissions between VIEWER, MEMBER, and ADMIN roles', async () => {
    const org = await db.organization.create({
      data: { name: 'RBAC Org', slug: `rbac-org-${Date.now()}` },
    });

    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'RBAC Target',
        url: 'https://example.com',
        normalizedUrl: 'https://example.com',
        domain: 'example.com',
      },
    });

    // 1. Setup Viewer User
    const viewerUser = await db.user.create({
      data: { email: `viewer_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: viewerUser.id, role: 'VIEWER' },
    });
    const viewerToken = createAccessToken(viewerUser.id, org.id);

    // 2. Setup Member User
    const memberUser = await db.user.create({
      data: { email: `member_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: memberUser.id, role: 'MEMBER' },
    });
    const memberToken = createAccessToken(memberUser.id, org.id);

    // 3. Setup Admin User
    const adminUser = await db.user.create({
      data: { email: `admin_${Date.now()}@example.com`, passwordHash: 'hash' },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: adminUser.id, role: 'ADMIN' },
    });
    const adminToken = createAccessToken(adminUser.id, org.id);

    // --- Viewer tests ---
    // Viewer CAN view websites
    const viewerGetWebsites = await request(app)
      .get('/api/v1/websites')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerGetWebsites.status).toBe(200);

    // Viewer CANNOT start audits (Requires AUDIT_RUN) -> 403
    const viewerStartAudit = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ websiteId: website.id });
    expect(viewerStartAudit.status).toBe(403);
    expect(viewerStartAudit.body.error.code).toBe('FORBIDDEN');

    // Viewer CANNOT create websites (Requires WEBSITE_MANAGE) -> 403
    const viewerCreateSite = await request(app)
      .post('/api/v1/websites')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Blocked', url: 'https://blocked.com' });
    expect(viewerCreateSite.status).toBe(403);

    // Viewer CANNOT manage API keys -> 403
    const viewerApiKey = await request(app)
      .get('/api/v1/api-keys')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerApiKey.status).toBe(403);

    // --- Member tests ---
    // Member CAN start audit
    const memberStartAudit = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ websiteId: website.id });
    expect(memberStartAudit.status).toBe(202);

    // Member CANNOT manage API keys -> 403
    const memberApiKey = await request(app)
      .get('/api/v1/api-keys')
      .set('Authorization', `Bearer ${memberToken}`);
    expect(memberApiKey.status).toBe(403);

    // --- Admin tests ---
    // Admin CAN manage API keys
    const adminApiKey = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Key', scopes: ['audit:read'] });
    expect(adminApiKey.status).toBe(201);
    expect(adminApiKey.body.data.rawKey).toBeDefined();
  });
});
