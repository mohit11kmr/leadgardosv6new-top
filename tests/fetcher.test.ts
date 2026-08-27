import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { classifyError, fetchBoundedText, fetchPage } from '../apps/worker/src/audit/fetcher.js';

process.env.NODE_ENV = 'test';
process.env.ALLOW_LOCAL_FIXTURES = 'true';

let fetchServer: http.Server;
let fetchPort: number;

beforeAll(async () => {
  fetchServer = http.createServer((req, res) => {
    const url = req.url ?? '/';

    if (url === '/slow') {
      // Simulate delayed response
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><body>Delayed</body></html>');
      }, 500);
    } else if (url === '/redirect-loop') {
      res.writeHead(302, { location: '/redirect-loop' });
      res.end();
    } else if (url === '/large') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('A'.repeat(50_000));
    } else if (url === '/non-html') {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('%PDF-1.4');
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>Fetch Test</title></head><body>Normal</body></html>');
    }
  });

  await new Promise<void>((resolve) => {
    fetchServer.listen(0, '127.0.0.1', () => {
      const addr = fetchServer.address() as { port: number };
      fetchPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => fetchServer.close(() => resolve()));
});

describe('Fetcher Subsystem (Requirement 29)', () => {
  it('correctly classifies standard errors', () => {
    expect(classifyError(new Error('SSRF blocked host'))).toBe('SSRF_BLOCKED');
    expect(classifyError(new Error('Redirect limit exceeded'))).toBe('REDIRECT_ERROR');
    expect(classifyError(new Error('CONTENT_TOO_LARGE'))).toBe('CONTENT_TOO_LARGE');
    expect(classifyError(new Error('UNSUPPORTED_CONTENT'))).toBe('UNSUPPORTED_CONTENT');
    expect(classifyError(new Error('TLS error in handshake'))).toBe('TLS_ERROR');
    expect(classifyError(new Error('getaddrinfo ENOTFOUND example.invalid'))).toBe('DNS_ERROR');
  });

  it('fetches normal HTML page with parsed metadata', async () => {
    const controller = new AbortController();
    const page = await fetchPage(`http://127.0.0.1:${fetchPort}/`, controller.signal);

    expect(page.statusCode).toBe(200);
    expect(page.title).toBe('Fetch Test');
    expect(page.htmlAvailable).toBe(true);
    expect(page.html).toContain('Normal');
  });

  it('rejects unsupported content types (e.g. application/pdf)', async () => {
    const controller = new AbortController();
    await expect(fetchPage(`http://127.0.0.1:${fetchPort}/non-html`, controller.signal)).rejects.toThrow(
      'UNSUPPORTED_CONTENT'
    );
  });

  it('enforces maximum response bytes limit in streaming reader', async () => {
    const controller = new AbortController();
    // Set maxBytes limit lower than the 50k payload
    await expect(
      fetchPage(`http://127.0.0.1:${fetchPort}/large`, controller.signal, 0, undefined, 10_000)
    ).rejects.toThrow('CONTENT_TOO_LARGE');
  });
});
