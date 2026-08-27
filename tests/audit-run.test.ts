import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { db } from '@leadguard/database';
import { processAudit } from '../apps/worker/src/audit/index.js';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';

let mockServer: http.Server;
let mockPort: number;

beforeAll(async () => {
  mockServer = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/slow') {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>Delayed page</body></html>');
      }, 500);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>Run Test</title></head><body>OK</body></html>');
    }
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => {
      const addr = mockServer.address() as { port: number };
      mockPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
});

describe('AuditRun Lifecycle & Execution History (Requirement 4, 5, 24)', () => {
  it('records execution attempt in AuditRun with startedAt, completedAt, durationMs, and pagesFetched', async () => {
    const org = await db.organization.create({
      data: { name: 'AuditRun Org', slug: `auditrun-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'AuditRun Site',
        url: `http://127.0.0.1:${mockPort}/`,
        normalizedUrl: `http://127.0.0.1:${mockPort}/`,
        domain: '127.0.0.1',
      },
    });
    const audit = await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'QUEUED',
      },
    });

    const controller = new AbortController();
    const result = await processAudit(audit.id, controller.signal, { maxPages: 1 });
    expect(result.status).toBe('COMPLETED');

    const runs = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runs).toHaveLength(1);
    const run = runs[0]!;

    expect(run.status).toBe('COMPLETED');
    expect(run.startedAt).toBeInstanceOf(Date);
    expect(run.completedAt).toBeInstanceOf(Date);
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
    expect(run.pagesFetched).toBe(1);
    expect(run.findingsCount).toBeGreaterThanOrEqual(0);
  });

  it('records CANCELLED in AuditRun when aborted mid-crawl', async () => {
    const org = await db.organization.create({
      data: { name: 'Cancel Org', slug: `cancel-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Cancel Site',
        url: `http://127.0.0.1:${mockPort}/slow`,
        normalizedUrl: `http://127.0.0.1:${mockPort}/slow`,
        domain: '127.0.0.1',
      },
    });
    const audit = await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'QUEUED',
      },
    });

    const controller = new AbortController();
    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);

    const result = await processAudit(audit.id, controller.signal, { maxPages: 5 });
    expect(result.status).toBe('CANCELLED');

    const runs = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('CANCELLED');
    expect(runs[0]?.errorCode).toBe('ABORTED');
  });

  it('handles global timeout cleanly and records TIMEOUT error code', async () => {
    const org = await db.organization.create({
      data: { name: 'Timeout Org', slug: `timeout-org-${Date.now()}` },
    });
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Timeout Site',
        url: `http://127.0.0.1:${mockPort}/slow`,
        normalizedUrl: `http://127.0.0.1:${mockPort}/slow`,
        domain: '127.0.0.1',
      },
    });
    const audit = await db.audit.create({
      data: {
        organizationId: org.id,
        websiteId: website.id,
        status: 'QUEUED',
      },
    });

    const controller = new AbortController();
    // Simulate very tight global timeout (100ms) with a 500ms slow server
    const result = await processAudit(audit.id, controller.signal, {
      maxPages: 5,
      globalTimeoutMs: 100,
      perRequestTimeoutMs: 2000,
    });

    expect(['PARTIAL', 'FAILED']).toContain(result.status);

    const runs = await db.auditRun.findMany({ where: { auditId: audit.id } });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.errorCode).toBe('TIMEOUT');
  });
});
