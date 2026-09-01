import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import { fetchPinned } from './pinned-fetch.js';
import type { ValidatedTarget } from '../url-security.js';

/**
 * SEC-1 regression tests.
 *
 * Limitation, stated explicitly per the task's own instruction rather than
 * overclaiming: these tests do NOT simulate an actual attacker flipping a
 * live DNS record mid-request (that would require standing up a real,
 * short-TTL authoritative DNS server as a test fixture — a materially larger
 * test harness than this phase's scope). What they DO deterministically
 * prove, using only real Node networking (no mocks): fetchPinned's
 * connection is driven entirely by the `addresses` already captured during
 * validation and NEVER by re-resolving the URL's hostname. That is the
 * exact property that closes the SEC-1 gap — if the connection re-resolved
 * the hostname (the old, vulnerable `fetch(url)` behavior), it would be
 * exposed to whatever DNS answer exists *at connection time*, which is
 * precisely the window a rebinding attacker controls.
 *
 * The proof mechanism: `example.invalid` is a hostname reserved by RFC 2606
 * to never resolve via real DNS, ever. A `target` is constructed with that
 * hostname but a manually-supplied `addresses` array pointing at a real
 * local test server. If fetchPinned's connection depended on resolving the
 * hostname (the vulnerable behavior), the request would fail with a DNS
 * error (ENOTFOUND) every time, since example.invalid can never resolve. It
 * doesn't — the request succeeds and returns content that only the pinned
 * server serves, proving the connection used the pin, not the hostname.
 */

let activeServer: http.Server | undefined;

afterEach(async () => {
  if (activeServer) {
    await new Promise<void>((resolve) => activeServer!.close(() => resolve()));
    activeServer = undefined;
  }
});

function startServer(responseBody: string): Promise<{ address: string; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(responseBody);
    });
    activeServer = server;
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ address: '127.0.0.1', port });
    });
  });
}

describe('SEC-1: fetchPinned connects to the pinned address, never re-resolves the hostname', () => {
  it('succeeds against a never-resolvable hostname when pinned to a real local server (proves no re-resolution occurs)', async () => {
    const { address, port } = await startServer('PINNED_SERVER_CONTENT');

    // A URL whose hostname is guaranteed to never resolve via real DNS
    // (RFC 2606 reserved), but a pinned address pointing at our real server.
    const target: ValidatedTarget = {
      url: new URL(`http://example.invalid:${port}/`),
      addresses: [address],
      family: 4,
    };

    const res = await fetchPinned(target);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe('PINNED_SERVER_CONTENT');
  });

  it('control: plain fetch() against the same never-resolvable hostname genuinely fails with a DNS error', async () => {
    const { port } = await startServer('SHOULD_NEVER_BE_REACHED');

    // Demonstrates the vulnerable baseline this fix replaces: without
    // pinning, connecting requires resolving the hostname, and
    // example.invalid can never resolve — so plain fetch() must fail here,
    // in contrast to fetchPinned succeeding above against the identical
    // hostname+port.
    await expect(fetch(`http://example.invalid:${port}/`)).rejects.toThrow();
  });

  it('uses the FIRST address in a multi-address target deterministically', async () => {
    const { address, port } = await startServer('FIRST_ADDRESS_CONTENT');
    const target: ValidatedTarget = {
      url: new URL(`http://example.invalid:${port}/`),
      // A second, bogus, never-listening address must never be tried —
      // fetchPinned pins to addresses[0] only.
      addresses: [address, '203.0.113.1'],
      family: 4,
    };

    const res = await fetchPinned(target);
    expect(await res.text()).toBe('FIRST_ADDRESS_CONTENT');
  });

  it('preserves the original hostname for the outgoing Host header (server-transparency requirement)', async () => {
    let receivedHost: string | undefined;
    const server = http.createServer((req, res) => {
      receivedHost = req.headers.host;
      res.writeHead(200);
      res.end('ok');
    });
    activeServer = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const target: ValidatedTarget = {
      url: new URL(`http://example.invalid:${port}/`),
      addresses: ['127.0.0.1'],
      family: 4,
    };
    await fetchPinned(target);

    expect(receivedHost).toBe(`example.invalid:${port}`);
  });

  it('falls back to ordinary fetch() when addresses is empty (ALLOW_LOCAL_FIXTURES bypass mode)', async () => {
    const { port } = await startServer('FIXTURE_BYPASS_CONTENT');
    const target: ValidatedTarget = {
      url: new URL(`http://127.0.0.1:${port}/`),
      addresses: [],
      family: 4,
    };

    const res = await fetchPinned(target);
    expect(await res.text()).toBe('FIXTURE_BYPASS_CONTENT');
  });

  it('propagates POST method, headers, and body correctly through the pinned path', async () => {
    let receivedMethod: string | undefined;
    let receivedHeader: string | undefined;
    let receivedBody = '';
    const server = http.createServer((req, res) => {
      receivedMethod = req.method;
      receivedHeader = req.headers['x-test-header'] as string | undefined;
      req.on('data', (chunk) => (receivedBody += chunk));
      req.on('end', () => {
        res.writeHead(200);
        res.end('ok');
      });
    });
    activeServer = server;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const target: ValidatedTarget = {
      url: new URL(`http://example.invalid:${port}/`),
      addresses: ['127.0.0.1'],
      family: 4,
    };
    await fetchPinned(target, {
      method: 'POST',
      headers: { 'X-Test-Header': 'hello' },
      body: 'request-body-content',
    });

    expect(receivedMethod).toBe('POST');
    expect(receivedHeader).toBe('hello');
    expect(receivedBody).toBe('request-body-content');
  });
});
