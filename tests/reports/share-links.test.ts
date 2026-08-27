import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { reportService } from '../../apps/api/src/services/reportService.js';

describe('Reports & Cryptographic Share Links (LG-025, LG-026)', () => {
  let user: any;
  let org: any;
  let website: any;
  let audit: any;
  let token: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `report-test-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Report Test Org', slug: `report-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Report Test Site',
        url: 'https://report-test.com',
        normalizedUrl: 'https://report-test.com',
        domain: 'report-test.com',
      },
    });
    audit = await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'COMPLETED',
      },
    });
    await db.auditScore.create({
      data: {
        auditId: audit.id,
        overall: 82,
        lead: 85,
        advertising: 80,
        seo: 80,
        security: 85,
      },
    });
    await db.auditFinding.create({
      data: {
        auditId: audit.id,
        ruleId: 'form-missing-csrf',
        category: 'SECURITY',
        severity: 'HIGH',
        title: 'Missing CSRF protection',
        description: 'Form submission is vulnerable to CSRF',
        evidence: {},
        scoreImpact: 10,
        recommendation: 'Add CSRF token to form',
      },
    });

    token = createAccessToken(user.id, org.id);
  });

  it('generates an immutable report snapshot and retrieves it', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({
        auditId: audit.id,
        title: 'Executive Diagnostic Report',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.snapshotData.score.overall).toBe(82);
    expect(res.body.data.snapshotData.findings).toHaveLength(1);

    const reportId = res.body.data.id;

    // Get report
    const getRes = await request(app)
      .get(`/api/v1/reports/${reportId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe('Executive Diagnostic Report');
    expect(getRes.body.data.snapshotData.score.lead).toBe(85);
  });

  it('creates cryptographic share links and prevents raw token leakage in DB', async () => {
    const report = await reportService.createReportSnapshot(org.id, audit.id);

    const shareRes = await request(app)
      .post(`/api/v1/reports/${report.id}/share`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        password: 'securePassword123',
        expiresInDays: 7,
      });

    expect(shareRes.status).toBe(201);
    expect(shareRes.body.success).toBe(true);
    expect(shareRes.body.data.rawToken).toMatch(/^lg_share_/);

    const rawToken = shareRes.body.data.rawToken;

    // Verify DB does NOT store raw token
    const dbLinks = await db.reportShareLink.findMany({ where: { reportId: report.id } });
    expect(dbLinks[0].tokenHash).not.toBe(rawToken);
    expect(dbLinks[0].passwordHash).toBeDefined();
    expect(dbLinks[0].passwordHash).not.toBe('securePassword123');

    // Access public endpoint without password -> requires password
    const unauthedRes = await request(app).get(`/api/v1/reports/share/${rawToken}`);
    expect(unauthedRes.status).toBe(401);
    expect(unauthedRes.body.error.code).toBe('PASSWORD_REQUIRED');

    // Access public endpoint with wrong password -> invalid password
    const wrongPassRes = await request(app).get(`/api/v1/reports/share/${rawToken}?password=wrong`);
    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.error.code).toBe('INVALID_PASSWORD');

    // Access public endpoint with correct password -> returns sanitized snapshot
    const successRes = await request(app).get(`/api/v1/reports/share/${rawToken}?password=securePassword123`);
    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.snapshot.score.overall).toBe(82);

    // Verify accessCount incremented
    const updatedDbLink = await db.reportShareLink.findUnique({ where: { id: dbLinks[0].id } });
    expect(updatedDbLink?.accessCount).toBe(1);
    expect(updatedDbLink?.lastAccessedAt).toBeDefined();
  });

  it('revokes share links and returns 404/revoked on subsequent access', async () => {
    const report = await reportService.createReportSnapshot(org.id, audit.id);
    const { shareLink, rawToken } = await reportService.createShareLink(org.id, report.id);

    // Revoke
    const revokeRes = await request(app)
      .delete(`/api/v1/reports/${report.id}/share/${shareLink.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(revokeRes.status).toBe(200);

    // Subsequent access fails
    const accessRes = await request(app).get(`/api/v1/reports/share/${rawToken}`);
    expect(accessRes.status).toBe(404);
    expect(accessRes.body.error.code).toBe('SHARE_LINK_NOT_FOUND');
  });
});
