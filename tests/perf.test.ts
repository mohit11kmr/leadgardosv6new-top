import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

let benchServer: http.Server;
let benchPort: number;

beforeAll(async () => {
  benchServer = http.createServer((req, res) => {
    const url = req.url?.replace(/^\//, '') || 'index.html';
    const filePath = path.join(
      process.cwd(),
      'tests/fixtures/multipage-site',
      url.endsWith('.html') ? url : `${url}.html`
    );

    const actualFile = fs.existsSync(filePath)
      ? filePath
      : path.join(process.cwd(), 'tests/fixtures/multipage-site/index.html');

    const content = fs.readFileSync(actualFile, 'utf-8');
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
    });
    res.end(content);
  });

  await new Promise<void>((resolve) => {
    benchServer.listen(0, '127.0.0.1', () => {
      const addr = benchServer.address() as { port: number };
      benchPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => benchServer.close(() => resolve()));
});

describe('Performance Benchmarks: Serial vs Bounded Concurrent Crawl (Requirement 27)', () => {
  it('benchmarks 1-page, 5-page, and 10-page crawls under serial vs concurrent modes', async () => {
    const org = await db.organization.create({
      data: { name: 'Benchmark Org', slug: `bench-${Date.now()}` },
    });

    const targetUrl = `http://127.0.0.1:${benchPort}`;
    const website = await db.website.create({
      data: {
        organizationId: org.id,
        name: 'Benchmark Multipage Site',
        url: targetUrl,
        normalizedUrl: targetUrl,
        domain: '127.0.0.1',
      },
    });

    const runBenchmark = async (maxPages: number, concurrencyLimit: number) => {
      const audit = await db.audit.create({
        data: {
          organizationId: org.id,
          websiteId: website.id,
          status: 'QUEUED',
        },
      });

      const start = Date.now();
      const controller = new AbortController();
      const result = await processAudit(audit.id, controller.signal, {
        maxPages,
        concurrencyLimit,
        maxDepth: 3,
      });
      const durationMs = Date.now() - start;

      const pagesPerSec = Math.round((result.pages / (durationMs / 1000)) * 100) / 100;
      return {
        auditId: audit.id,
        maxPages,
        concurrencyLimit,
        pagesCrawled: result.pages,
        durationMs,
        pagesPerSec,
        status: result.status,
      };
    };

    // 1. Single page benchmark
    const res1 = await runBenchmark(1, 1);
    expect(res1.pagesCrawled).toBe(1);

    // 2. 5 pages serial vs concurrent
    const res5Serial = await runBenchmark(5, 1);
    const res5Concurrent = await runBenchmark(5, 4);
    expect(res5Concurrent.pagesCrawled).toBeGreaterThanOrEqual(1);

    // 3. 10 pages serial vs concurrent
    const res10Serial = await runBenchmark(10, 1);
    const res10Concurrent = await runBenchmark(10, 4);
    expect(res10Concurrent.pagesCrawled).toBeGreaterThanOrEqual(1);

    console.log(
      JSON.stringify({
        level: 'info',
        benchmark: 'CRAWL_CONCURRENCY_BENCHMARK_RESULTS',
        onePage: res1,
        fivePagesSerial: res5Serial,
        fivePagesConcurrent: res5Concurrent,
        tenPagesSerial: res10Serial,
        tenPagesConcurrent: res10Concurrent,
      })
    );

    expect(res10Concurrent.durationMs).toBeLessThan(10_000);
  });
});
