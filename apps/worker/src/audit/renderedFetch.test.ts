import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { fetchRenderedHtml, attachNetworkEvidenceCapture } from './renderedFetch.js';

// These tests run with ALLOW_LOCAL_FIXTURES=true (set by vitest.config.ts /
// global-setup.ts), which is what lets validateExternalUrl accept a local
// http://127.0.0.1 test server below instead of rejecting it as a private
// address.

function startTestServer(html: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('fetchRenderedHtml', () => {
  it('returns a non-attempted, empty result (never throws) for an SSRF-blocked URL', async () => {
    const controller = new AbortController();
    const result = await fetchRenderedHtml('ftp://not-http-or-https.test', controller.signal);
    expect(result.html).toBeNull();
    expect(result.networkEvidence).toEqual([]);
    expect(result.captureAttempted).toBe(false);
  });

  it('returns a non-attempted, empty result when the abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await fetchRenderedHtml('https://example.com', controller.signal);
    expect(result.html).toBeNull();
    expect(result.captureAttempted).toBe(false);
  });

  it('renders JavaScript-injected content that a plain fetch() would never see', async () => {
    const html = `<!DOCTYPE html><html><head><title>SPA Shell</title></head><body>
      <div id="root"></div>
      <script>
        document.getElementById('root').innerHTML =
          '<a href="https://wa.me/919876543210">Chat with us</a>';
      </script>
    </body></html>`;

    const server = await startTestServer(html);
    try {
      const controller = new AbortController();
      const rendered = await fetchRenderedHtml(server.url, controller.signal, 10_000);

      expect(rendered.html).not.toBeNull();
      expect(rendered.captureAttempted).toBe(true);
      // The raw server response has no real <a> markup pointing at wa.me —
      // that string only exists inside the <script> tag as JS source text
      // (stripped out here before checking, since it'd otherwise match this
      // regex too as literal characters, without being real markup).
      const rawMarkupOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      expect(rawMarkupOnly).not.toMatch(/<a[^>]+wa\.me/);
      // The rendered DOM has it as a real anchor after the script executed.
      expect(rendered.html).toMatch(/<a[^>]+wa\.me/);
    } finally {
      await server.close();
    }
  }, 20_000);

  it('captures no tracking network evidence for a page with none (present-but-quiet, not a false positive)', async () => {
    const html = `<!DOCTYPE html><html><head><title>Plain Page</title></head><body>Hello</body></html>`;
    const server = await startTestServer(html);
    try {
      const controller = new AbortController();
      const rendered = await fetchRenderedHtml(server.url, controller.signal, 10_000);
      expect(rendered.captureAttempted).toBe(true);
      expect(rendered.networkEvidence).toEqual([]);
    } finally {
      await server.close();
    }
  }, 20_000);
});

/**
 * Exercises the request → NetworkEvidenceEntry pipeline (attachNetworkEvidenceCapture,
 * shared with fetchRenderedHtml) end-to-end against a Playwright page this
 * test owns directly — using page.route() to fulfill requests to the real
 * tracking-provider hostnames entirely locally (no DNS lookup, no bytes ever
 * leave the machine), per the requirement to use local deterministic
 * fixtures rather than depend on live third-party analytics endpoints.
 * page.route() fulfillment and the 'request' event are independent: the
 * event still fires with the real matched URL even though the response is
 * served locally.
 */
describe('attachNetworkEvidenceCapture (network-verified tracking, local fixtures only)', () => {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

  afterAll(async () => {
    await browser?.close();
  });

  async function renderFixtureWithRequests(bodyScript: string) {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Fulfill every request locally — nothing here ever reaches a real
    // network interface, regardless of hostname.
    await page.route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith('http://127.0.0.1')) return route.continue();
      return route.fulfill({ status: 204, contentType: 'text/plain', body: '' });
    });

    const networkEvidence = attachNetworkEvidenceCapture(page, 'https://customer-site.test/');

    const html = `<!DOCTYPE html><html><body><script>${bodyScript}</script></body></html>`;
    const server = await startTestServer(html);
    try {
      await page.goto(server.url, { waitUntil: 'networkidle', timeout: 10_000 });
    } finally {
      await server.close();
    }
    return networkEvidence;
  }

  it('records FIRED evidence for a real GA4 collect request', async () => {
    const evidence = await renderFixtureWithRequests(
      `fetch('https://www.google-analytics.com/g/collect?v=2&tid=G-TESTID&en=page_view').catch(()=>{});`
    );
    const ga4 = evidence.filter((e) => e.provider === 'GA4');
    expect(ga4.length).toBeGreaterThanOrEqual(1);
    expect(ga4[0]?.evidenceType).toBe('FIRED');
    expect(ga4[0]?.requestUrl).toBe('www.google-analytics.com/g/collect');
    expect(ga4[0]?.relevantQueryParams).toEqual({ tid: 'G-TESTID', en: 'page_view' });
    expect(ga4[0]?.pageUrl).toBe('https://customer-site.test/');
  }, 20_000);

  it('records FIRED evidence for a real Meta Pixel beacon request', async () => {
    const evidence = await renderFixtureWithRequests(
      `fetch('https://www.facebook.com/tr?id=999&ev=PageView').catch(()=>{});`
    );
    const meta = evidence.filter((e) => e.provider === 'META_PIXEL');
    expect(meta.length).toBeGreaterThanOrEqual(1);
    expect(meta[0]?.evidenceType).toBe('FIRED');
    // Only the allowlisted pixel id + event name — never Advanced Matching params.
    expect(meta[0]?.relevantQueryParams).toEqual({ id: '999', ev: 'PageView' });
  }, 20_000);

  it('records FIRED evidence for multiple distinct providers observed in the same page visit', async () => {
    const evidence = await renderFixtureWithRequests(`
      fetch('https://www.google-analytics.com/g/collect?tid=G-A&en=page_view').catch(()=>{});
      fetch('https://www.facebook.com/tr?id=1').catch(()=>{});
      fetch('https://www.googletagmanager.com/gtm.js?id=GTM-X').catch(()=>{});
    `);
    const providers = new Set(evidence.map((e) => e.provider));
    expect(providers.has('GA4')).toBe(true);
    expect(providers.has('META_PIXEL')).toBe(true);
    expect(providers.has('GTM')).toBe(true);
  }, 20_000);

  it('records every duplicate request rather than silently collapsing them', async () => {
    const evidence = await renderFixtureWithRequests(`
      fetch('https://www.google-analytics.com/g/collect?tid=G-A&en=e1').catch(()=>{});
      fetch('https://www.google-analytics.com/g/collect?tid=G-A&en=e2').catch(()=>{});
      fetch('https://www.google-analytics.com/g/collect?tid=G-A&en=e3').catch(()=>{});
    `);
    const ga4 = evidence.filter((e) => e.provider === 'GA4');
    expect(ga4.length).toBe(3);
  }, 20_000);

  it('ignores ordinary non-tracking requests entirely', async () => {
    const evidence = await renderFixtureWithRequests(`
      fetch('https://cdn.example.test/app.js').catch(()=>{});
      fetch('https://fonts.googleapis.com/css?family=Roboto').catch(()=>{});
    `);
    expect(evidence).toEqual([]);
  }, 20_000);

  it('never captures headers, cookies, or full query strings beyond the narrow allowlist', async () => {
    const evidence = await renderFixtureWithRequests(
      `fetch('https://www.google-analytics.com/g/collect?tid=G-A&en=page_view&cid=555.123&uid=super-secret-user-id', { headers: { 'X-Secret': 'do-not-capture' } }).catch(()=>{});`
    );
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain('super-secret-user-id');
    expect(serialized).not.toContain('do-not-capture');
    expect(serialized).not.toContain('555.123');
  }, 20_000);
});
