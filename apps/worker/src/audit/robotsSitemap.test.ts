import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { fetchRobotsAndSitemap, parseRobotsTxt, isPathDisallowed } from './robotsSitemap.js';

// ALLOW_LOCAL_FIXTURES=true (set by vitest.config.ts / global-setup.ts) lets
// resolveAndValidateExternalUrl accept these local http://127.0.0.1 servers.

let activeServers: http.Server[] = [];

function startServer(routes: Record<string, { status?: number; body: string; contentType?: string }>): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url ?? '/'];
      if (!route) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(route.status ?? 200, { 'content-type': route.contentType ?? 'text/plain' });
      res.end(route.body);
    });
    activeServers.push(server);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((res) => server.close(() => res())) });
    });
  });
}

afterEach(async () => {
  await Promise.all(activeServers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  activeServers = [];
});

describe('parseRobotsTxt', () => {
  it('extracts Disallow rules from the wildcard User-agent block only', () => {
    const text = `
User-agent: Googlebot
Disallow: /googlebot-only/

User-agent: *
Disallow: /admin/
Disallow: /private/
Sitemap: https://example.test/sitemap.xml
`;
    const result = parseRobotsTxt(text);
    expect(result.disallowedPaths).toEqual(['/admin/', '/private/']);
    expect(result.disallowedPaths).not.toContain('/googlebot-only/');
    expect(result.sitemapUrls).toEqual(['https://example.test/sitemap.xml']);
  });

  it('ignores comments and blank lines', () => {
    const text = `
# This is a comment
User-agent: *
# another comment
Disallow: /secret/
`;
    expect(parseRobotsTxt(text).disallowedPaths).toEqual(['/secret/']);
  });

  it('returns empty results for a robots.txt with no wildcard block', () => {
    const text = `User-agent: SomeBot\nDisallow: /x/`;
    expect(parseRobotsTxt(text).disallowedPaths).toEqual([]);
  });
});

describe('isPathDisallowed', () => {
  it('matches a simple prefix rule', () => {
    expect(isPathDisallowed('/admin/users', ['/admin/'])).toBe(true);
    expect(isPathDisallowed('/public/page', ['/admin/'])).toBe(false);
  });

  it('treats a bare "/" rule as disallow-everything', () => {
    expect(isPathDisallowed('/anything', ['/'])).toBe(true);
  });
});

describe('fetchRobotsAndSitemap', () => {
  it('fetches and parses robots.txt Disallow rules from a real local server', async () => {
    const server = await startServer({
      '/robots.txt': { body: 'User-agent: *\nDisallow: /internal/\n' },
    });
    try {
      const result = await fetchRobotsAndSitemap(server.origin, new AbortController().signal);
      expect(result.robotsFetched).toBe(true);
      expect(result.disallowedPaths).toEqual(['/internal/']);
    } finally {
      await server.close();
    }
  });

  it('falls back to /sitemap.xml when robots.txt has no Sitemap: directive', async () => {
    const routes: Record<string, { body: string; contentType?: string }> = {};
    const server = await startServer(routes);
    const origin = server.origin;
    routes['/robots.txt'] = { body: 'User-agent: *\nDisallow: /admin/\n' };
    routes['/sitemap.xml'] = {
      contentType: 'application/xml',
      body: `<urlset><url><loc>${origin}/page-1</loc></url><url><loc>${origin}/page-2</loc></url></urlset>`,
    };
    try {
      const result = await fetchRobotsAndSitemap(origin, new AbortController().signal);
      expect(result.sitemapFetched).toBe(true);
      expect(result.sitemapUrls).toEqual([`${origin}/page-1`, `${origin}/page-2`]);
    } finally {
      await server.close();
    }
  });

  it('uses the Sitemap: URL declared in robots.txt when present, not the /sitemap.xml default', async () => {
    const routes: Record<string, { body: string; contentType?: string }> = {};
    const server = await startServer(routes);
    const origin = server.origin;
    routes['/robots.txt'] = { body: `User-agent: *\nSitemap: ${origin}/custom-sitemap.xml\n` };
    routes['/custom-sitemap.xml'] = {
      contentType: 'application/xml',
      body: `<urlset><url><loc>${origin}/a</loc></url><url><loc>${origin}/b</loc></url></urlset>`,
    };
    try {
      const result = await fetchRobotsAndSitemap(origin, new AbortController().signal);
      expect(result.sitemapFetched).toBe(true);
      expect(result.sitemapUrls).toContain(`${origin}/a`);
      expect(result.sitemapUrls).toContain(`${origin}/b`);
    } finally {
      await server.close();
    }
  });

  it('is fully non-fatal when robots.txt and sitemap.xml are both absent (common case)', async () => {
    const server = await startServer({});
    try {
      const result = await fetchRobotsAndSitemap(server.origin, new AbortController().signal);
      expect(result.robotsFetched).toBe(false);
      expect(result.sitemapFetched).toBe(false);
      expect(result.disallowedPaths).toEqual([]);
      expect(result.sitemapUrls).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it('parses a sitemap index and follows nested sitemaps', async () => {
    const routes: Record<string, { body: string; contentType?: string }> = {};
    const server = await startServer(routes);
    const origin = server.origin;
    routes['/robots.txt'] = { body: `User-agent: *\nSitemap: ${origin}/sitemap-index.xml\n` };
    routes['/sitemap-index.xml'] = {
      contentType: 'application/xml',
      body: `<sitemapindex><sitemap><loc>${origin}/sitemap-1.xml</loc></sitemap></sitemapindex>`,
    };
    routes['/sitemap-1.xml'] = {
      contentType: 'application/xml',
      body: `<urlset><url><loc>${origin}/nested-page-1</loc></url><url><loc>${origin}/nested-page-2</loc></url></urlset>`,
    };
    try {
      const result = await fetchRobotsAndSitemap(origin, new AbortController().signal);
      expect(result.sitemapFetched).toBe(true);
      expect(result.sitemapUrls).toContain(`${origin}/nested-page-1`);
      expect(result.sitemapUrls).toContain(`${origin}/nested-page-2`);
    } finally {
      await server.close();
    }
  });
});
