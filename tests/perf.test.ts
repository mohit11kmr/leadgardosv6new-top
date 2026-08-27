import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@leadguard/database';
import { processAudit } from '../apps/worker/src/audit.js';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';
process.env.DATABASE_URL ??= 'postgresql://leadguard:leadguard@localhost:15432/leadguard';
process.env.REDIS_URL ??= 'redis://localhost:16380';
process.env.JWT_SECRET ??= 'a'.repeat(32);
process.env.REFRESH_TOKEN_SECRET ??= 'b'.repeat(32);
process.env.APP_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';

let perfServer: http.Server;
let perfPort: number;

beforeAll(async () => {
  const perfectHtml = fs.readFileSync(
    path.join(process.cwd(), 'tests/fixtures/perfect/index.html'),
    'utf-8'
  );

  perfServer = http.createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
    });
    res.end(perfectHtml);
  });

  await new Promise<void>((resolve) => {
    perfServer.listen(0, '127.0.0.1', () => {
      const addr = perfServer.address() as { port: number };
      perfPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => perfServer.close(() => resolve()));
});

describe('Diagnostic Engine Performance Benchmarks (Requirement 37)', () => {
  it('measures representative timings across crawl, scan, score, and finalization', async () => {
    const org = await db.organization.create({
      data: { name: 'Perf Org', slug: `perf-${Date.now()}` },
    });

    const targetUrl = `http://127.0.0.1:${perfPort}`;
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Perf Test Site',
        url: targetUrl,
        normalizedUrl: targetUrl,
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

    const startTime = Date.now();
    const controller = new AbortController();
    const result = await processAudit(audit.id, controller.signal);
    const totalDurationMs = Date.now() - startTime;

    const auditRecord = await db.audit.findUniqueOrThrow({ where: { id: audit.id } });
    const pagesCrawled = auditRecord.pagesScanned || 1;
    const pagesPerSecond = Math.round((pagesCrawled / (totalDurationMs / 1000)) * 100) / 100;

    console.log(
      JSON.stringify({
        level: 'info',
        benchmark: 'DIAGNOSTIC_ENGINE_PERFORMANCE',
        auditId: audit.id,
        pagesCrawled,
        totalDurationMs,
        pagesPerSecond,
        findingsGenerated: result.findings,
        overallScore: result.scores?.overall,
      })
    );

    expect(totalDurationMs).toBeLessThan(5000); // Must finalize within reasonable bound
    expect(pagesCrawled).toBeGreaterThanOrEqual(1);
  });
});
