import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { BoundedCrawler, discoverLinks } from '../apps/worker/src/audit/crawler.js';
import type { PageRecord } from '@leadguard/shared';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';

let testServer: http.Server;
let testPort: number;

beforeAll(async () => {
  testServer = http.createServer((req, res) => {
    const url = req.url ?? '/';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });

    if (url === '/') {
      res.end(`
        <!doctype html>
        <html>
          <head><title>Home Page</title></head>
          <body>
            <a href="/page1">Page 1</a>
            <a href="/page2">Page 2</a>
            <a href="/page3">Page 3</a>
            <a href="http://127.0.0.1:${testPort}/page1#duplicate">Duplicate Page 1 with fragment</a>
            <a href="http://127.0.0.1:${testPort}/page1/">Duplicate Page 1 with trailing slash</a>
            <a href="https://external.test/out">External</a>
          </body>
        </html>
      `);
    } else if (url.startsWith('/page1')) {
      res.end(`
        <!doctype html>
        <html>
          <head><title>Page 1</title></head>
          <body>
            <a href="/depth2-a">Depth 2 A</a>
            <a href="/depth2-b">Depth 2 B</a>
          </body>
        </html>
      `);
    } else if (url.startsWith('/page2')) {
      res.end(`
        <!doctype html>
        <html>
          <head><title>Page 2</title></head>
          <body>
            <a href="/depth2-c">Depth 2 C</a>
          </body>
        </html>
      `);
    } else if (url.startsWith('/depth2')) {
      res.end(`
        <!doctype html>
        <html>
          <head><title>Depth 2 Page</title></head>
          <body>
            <a href="/depth3-deep">Depth 3 Deep</a>
          </body>
        </html>
      `);
    } else if (url.startsWith('/depth3')) {
      res.end(`
        <!doctype html>
        <html>
          <head><title>Depth 3 Page</title></head>
          <body>Deepest page</body>
        </html>
      `);
    } else {
      res.end('<!doctype html><html><body>Default Page</body></html>');
    }
  });

  await new Promise<void>((resolve) => {
    testServer.listen(0, '127.0.0.1', () => {
      const addr = testServer.address() as { port: number };
      testPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => testServer.close(() => resolve()));
});

describe('Bounded Concurrent Crawler Subsystem (Requirement 29)', () => {
  it('discovers normalized internal links while ignoring fragments and external domains', () => {
    const page: PageRecord = {
      url: `http://127.0.0.1:${testPort}/`,
      finalUrl: `http://127.0.0.1:${testPort}/`,
      statusCode: 200,
      contentType: 'text/html',
      headers: {},
      htmlAvailable: true,
      responseTimeMs: 5,
      depth: 0,
      redirectChain: [],
      html: `
        <a href="/page1">Page 1</a>
        <a href="http://127.0.0.1:${testPort}/page1#hash">Page 1 with hash</a>
        <a href="https://external-domain.test/path">External</a>
      `,
    };

    const links = discoverLinks(page, `http://127.0.0.1:${testPort}`);
    expect(links).toContain(`http://127.0.0.1:${testPort}/page1`);
    expect(links.some((l) => l.includes('external-domain'))).toBe(false);
    expect(links.some((l) => l.includes('#hash'))).toBe(false);
  });

  it('strictly respects maxPages and maxDepth limits with bounded concurrency', async () => {
    const maxPages = 4;
    const maxDepth = 1;
    const concurrencyLimit = 2;

    const crawler = new BoundedCrawler({
      maxPages,
      maxDepth,
      concurrencyLimit,
    });

    const controller = new AbortController();
    const result = await crawler.crawl(`http://127.0.0.1:${testPort}`, controller.signal);

    expect(result.fetchedCount).toBeLessThanOrEqual(maxPages);
    expect(result.fetchedCount).toBeGreaterThan(0);

    // Verify all fetched pages are within maxDepth
    for (const page of result.pages.values()) {
      expect(page.depth).toBeLessThanOrEqual(maxDepth);
    }
  });

  it('handles abort signals gracefully and records duration', async () => {
    const crawler = new BoundedCrawler({ maxPages: 10, maxDepth: 3 });
    const controller = new AbortController();

    // Abort after 50ms
    setTimeout(() => controller.abort(), 50);

    const result = await crawler.crawl(`http://127.0.0.1:${testPort}`, controller.signal);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
