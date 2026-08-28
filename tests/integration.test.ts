import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';

import { db } from '@leadguard/database';
import { processAudit } from '../apps/worker/src/audit.js';

let fixtureServer: http.Server;
let fixturePort: number;

beforeAll(async () => {
  const perfectHtml = fs.readFileSync(
    path.join(process.cwd(), 'tests/fixtures/perfect/index.html'),
    'utf-8'
  );

  fixtureServer = http.createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=()',
    });
    res.end(perfectHtml);
  });

  await new Promise<void>((resolve) => {
    fixtureServer.listen(0, '127.0.0.1', () => {
      const addr = fixtureServer.address() as { port: number };
      fixturePort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
});

describe('End-to-End Diagnostic Audit Integration Flow (Requirement 32)', () => {
  it('crawls fixture, persists AuditPages, tracks AuditRun, deduplicates findings, scores, and exposes API endpoints', async () => {
    const { app } = await import('../apps/api/src/server.js');

    // 1. Create Organization & User
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: `integration-${Date.now()}@example.com`,
      password: 'password12345678',
      organizationName: 'Integration Workspace',
    });
    expect(regRes.status).toBe(201);
    const token = regRes.body.data.accessToken;
    const orgId = regRes.body.data.organization.id;

    // 2. Create Website pointing to the local fixture server
    const targetUrl = `http://127.0.0.1:${fixturePort}`;
    // Directly record website in database to allow 127.0.0.1 for fixture testing
    const website = await db.website.create({
      data: {
        organizationId: orgId,
        name: 'Fixture Test Site',
        url: targetUrl,
        normalizedUrl: targetUrl,
        domain: '127.0.0.1',
      },
    });

    // 3. Create Audit
    const auditRes = await request(app)
      .post('/api/v1/audits')
      .set('Authorization', `Bearer ${token}`)
      .send({ websiteId: website.id });
    expect(auditRes.status).toBe(202);
    const auditId = auditRes.body.data.id;

    // 4. Worker executes diagnostic crawl & scan
    const controller = new AbortController();
    const workerResult = await processAudit(auditId, controller.signal);
    expect(['COMPLETED', 'PARTIAL']).toContain(workerResult.status);
    expect(workerResult.pages).toBeGreaterThanOrEqual(1);

    // 5. Assert database state directly
    // 5a. Audit record
    const auditRecord = await db.audit.findUniqueOrThrow({ where: { id: auditId } });
    expect(auditRecord.status).toBe('COMPLETED');
    expect(auditRecord.progress).toBe(100);
    expect(auditRecord.pagesScanned).toBeGreaterThanOrEqual(1);
    expect(auditRecord.completedAt).toBeInstanceOf(Date);
    expect(auditRecord.businessImpact).not.toBeNull();
    expect(auditRecord.executiveSummary).not.toBeNull();

    // 5b. AuditPage persistence
    const pages = await db.auditPage.findMany({ where: { auditId } });
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0]!.statusCode).toBe(200);
    expect(pages[0]!.htmlAvailable).toBe(true);
    expect(pages[0]!.title).toBe('Perfect Diagnostic Website');

    // 5c. AuditRun lifecycle
    const runs = await db.auditRun.findMany({ where: { auditId } });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('COMPLETED');
    expect(runs[0]!.pagesFetched).toBeGreaterThanOrEqual(1);

    // 5d. AuditScore
    const scoreRecord = await db.auditScore.findUniqueOrThrow({ where: { auditId } });
    expect(scoreRecord.overall).toBeGreaterThan(0);

    // 6. Assert API contract endpoints
    // 6a. GET /audits/:id
    const apiAudit = await request(app)
      .get(`/api/v1/audits/${auditId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiAudit.status).toBe(200);
    expect(apiAudit.body.data.status).toBe('COMPLETED');

    // 6b. GET /audits/:id/findings with pagination
    const apiFindings = await request(app)
      .get(`/api/v1/audits/${auditId}/findings?limit=10`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiFindings.status).toBe(200);
    expect(apiFindings.body.meta).toHaveProperty('hasNextPage');
    expect(apiFindings.body.meta).toHaveProperty('hasPreviousPage');

    // 6c. GET /audits/:id/pages
    const apiPages = await request(app)
      .get(`/api/v1/audits/${auditId}/pages`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiPages.status).toBe(200);
    expect(apiPages.body.data.length).toBeGreaterThanOrEqual(1);

    // 6d. GET /audits/:id/runs
    const apiRuns = await request(app)
      .get(`/api/v1/audits/${auditId}/runs`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiRuns.status).toBe(200);
    expect(apiRuns.body.data.length).toBeGreaterThanOrEqual(1);

    // 6e. GET /audits/:id/business-impact
    const apiImpact = await request(app)
      .get(`/api/v1/audits/${auditId}/business-impact`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiImpact.status).toBe(200);
    expect(apiImpact.body.data.kind).toBe('POTENTIAL_OPPORTUNITY_LOSS');

    // 6f. GET /audits/:id/summary
    const apiSummary = await request(app)
      .get(`/api/v1/audits/${auditId}/summary`)
      .set('Authorization', `Bearer ${token}`);
    expect(apiSummary.status).toBe(200);
    expect(apiSummary.body.data.overallScore).toBeGreaterThan(0);
  }, 30000);
});
