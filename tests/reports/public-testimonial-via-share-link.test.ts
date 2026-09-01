import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@leadguard/database';
import request from 'supertest';
import { app } from '../../apps/api/src/server.js';
import { createAccessToken } from '../../apps/api/src/auth.js';
import { reportService } from '../../apps/api/src/services/reportService.js';

describe('Public testimonial submission via report share link', () => {
  let org: any;
  let report: any;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `pub-testimonial-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'hash' },
    });
    org = await db.organization.create({
      data: { name: 'Pub Testimonial Org', slug: `pub-testimonial-org-${Date.now()}-${Math.random()}` },
    });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Pub Testimonial Site',
        url: 'https://pub-testimonial.test',
        normalizedUrl: 'https://pub-testimonial.test',
        domain: 'pub-testimonial.test',
      },
    });
    const audit = await db.audit.create({ data: { organizationId: org.id, websiteId: website.id, status: 'COMPLETED' } });
    await db.auditScore.create({ data: { auditId: audit.id, overall: 80, lead: 80, advertising: 80, seo: 80, security: 80 } });

    report = await reportService.createReportSnapshot(org.id, audit.id);
  });

  it('accepts a testimonial submitted against a valid, unauthenticated share token and lands it as PENDING', async () => {
    const { rawToken } = await reportService.createShareLink(org.id, report.id);

    const res = await request(app)
      .post(`/api/v1/public/reports/${rawToken}/testimonial`)
      .send({ authorName: 'Priya Sharma', content: 'The audit found issues we never knew about.', rating: 5 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PENDING');

    const row = await db.testimonial.findUnique({ where: { id: res.body.data.id } });
    expect(row?.organizationId).toBe(org.id);
    expect(row?.status).toBe('PENDING');
  });

  it('rejects submission against a revoked share token with 404', async () => {
    const { rawToken, shareLink } = await reportService.createShareLink(org.id, report.id);
    await reportService.revokeShareLink(org.id, report.id, shareLink.id);

    const res = await request(app)
      .post(`/api/v1/public/reports/${rawToken}/testimonial`)
      .send({ authorName: 'Test', content: 'Test content' });

    expect(res.status).toBe(404);
  });

  it('rejects submission against a nonexistent token with 404', async () => {
    const res = await request(app)
      .post('/api/v1/public/reports/lg_share_nonexistent/testimonial')
      .send({ authorName: 'Test', content: 'Test content' });
    expect(res.status).toBe(404);
  });

  it('rejects missing required fields with 400', async () => {
    const { rawToken } = await reportService.createShareLink(org.id, report.id);
    const res = await request(app).post(`/api/v1/public/reports/${rawToken}/testimonial`).send({});
    expect(res.status).toBe(400);
  });
});
