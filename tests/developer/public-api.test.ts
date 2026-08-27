import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { apiKeyService } from '../../apps/api/src/services/apiKeyService.js';
import { reportService } from '../../apps/api/src/services/reportService.js';

describe('Public Developer REST API (LG-033)', () => {
  let user: any;
  let org: any;
  let website: any;
  let audit: any;
  let fullApiKey: string;
  let readOnlyApiKey: string;

  beforeEach(async () => {
    user = await db.user.create({
      data: { email: `public-api-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Public API Org', slug: `pub-api-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({
      data: { organizationId: org.id, userId: user.id, role: 'OWNER' },
    });
    website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Public Test Site',
        url: 'https://public-test.com',
        normalizedUrl: 'https://public-test.com',
        domain: 'public-test.com',
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
        overall: 90,
        lead: 92,
        advertising: 88,
        seo: 90,
        security: 90,
      },
    });

    const fullKeyRes = await apiKeyService.createApiKey(org.id, user.id, 'Full Key', [
      'AUDIT_READ',
      'AUDIT_RUN',
      'REPORT_READ',
      'MONITORING_READ',
      'MONITORING_RUN',
      'WEBSITE_READ',
    ]);
    fullApiKey = fullKeyRes.rawKey;

    const readOnlyRes = await apiKeyService.createApiKey(org.id, user.id, 'Read Only Key', [
      'AUDIT_READ',
      'REPORT_READ',
    ]);
    readOnlyApiKey = readOnlyRes.rawKey;
  });

  it('triggers an audit via /public/audits with AUDIT_RUN scope', async () => {
    const res = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${fullApiKey}`)
      .send({ url: 'https://new-scan-target.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.status).toBe('QUEUED');
  });

  it('rejects trigger audit if API key lacks AUDIT_RUN scope', async () => {
    const res = await request(app)
      .post('/api/v1/public/audits')
      .set('Authorization', `Bearer ${readOnlyApiKey}`)
      .send({ url: 'https://rejected-target.com' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('lists audits with cursor pagination via /public/audits', async () => {
    const res = await request(app)
      .get('/api/v1/public/audits?limit=10')
      .set('Authorization', `Bearer ${readOnlyApiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].score.overall).toBe(90);
  });

  it('retrieves immutable report details via /public/reports/:id', async () => {
    const report = await reportService.createReportSnapshot(org.id, audit.id);

    const res = await request(app)
      .get(`/api/v1/public/reports/${report.id}`)
      .set('Authorization', `Bearer ${readOnlyApiKey}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(report.id);
  });
});
