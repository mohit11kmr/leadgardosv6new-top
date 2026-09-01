import { describe, it, expect, afterAll } from 'vitest';
import http from 'node:http';
import { fetchRenderedHtml } from './renderedFetch.js';

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
  it('returns null (never throws) for an SSRF-blocked URL', async () => {
    const controller = new AbortController();
    const result = await fetchRenderedHtml('ftp://not-http-or-https.test', controller.signal);
    expect(result).toBeNull();
  });

  it('returns null when the abort signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await fetchRenderedHtml('https://example.com', controller.signal);
    expect(result).toBeNull();
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

      expect(rendered).not.toBeNull();
      // The raw server response has no real <a> markup pointing at wa.me —
      // that string only exists inside the <script> tag as JS source text
      // (stripped out here before checking, since it'd otherwise match this
      // regex too as literal characters, without being real markup).
      const rawMarkupOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      expect(rawMarkupOnly).not.toMatch(/<a[^>]+wa\.me/);
      // The rendered DOM has it as a real anchor after the script executed.
      expect(rendered).toMatch(/<a[^>]+wa\.me/);
    } finally {
      await server.close();
    }
  }, 20_000);
});
