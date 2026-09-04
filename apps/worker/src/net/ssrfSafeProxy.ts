/**
 * SSRF-safe forward proxy for Chromium's browser-rendering paths
 * (renderedFetch.ts, pdfWorker.ts's renderHtmlToPdf). Closes the disclosed
 * SEC-1 gap: Playwright has no equivalent of Node's `http.request({lookup})`
 * — there is no way to hand Chromium a pre-validated destination IP and have
 * it connect there directly. `page.route()` can inspect/abort requests, but
 * it cannot control which IP the underlying connection is actually made to,
 * so a hostname that resolves safely at inspection time and unsafely a
 * moment later (DNS rebinding) is not something route-based interception
 * can reliably prevent.
 *
 * The fix: run a tiny local forward proxy (this module), point Chromium's
 * `proxy` launch option at it, and let the PROXY — plain Node code, with
 * the exact same address-pinning capability `pinned-fetch.ts` already uses
 * for every other fetcher in this codebase — own the real outbound
 * connection for every request Chromium makes: the initial navigation,
 * every subresource (images, scripts, XHR/fetch calls the page's own JS
 * issues, iframes), and every redirect hop, with no exceptions and no
 * separate plumbing needed for "what about redirects" — a redirect target
 * is just another request that hits this same proxy and gets independently
 * validated.
 *
 * HTTPS traffic is tunneled via CONNECT without ever being decrypted here:
 * this proxy resolves+validates the CONNECT target's hostname, opens a raw
 * TCP socket to the validated (pinned) IP, and splices the two sockets
 * together. Chromium performs the actual TLS handshake end-to-end through
 * that tunnel with the real origin server, so certificate/SNI validation
 * works exactly as it would without a proxy — this is not a MITM, and
 * introduces no certificate-trust weakening whatsoever.
 *
 * Plain HTTP requests (proxy receives an absolute-URI request line, e.g.
 * `GET http://example.com/x HTTP/1.1`) are validated the same way and then
 * forwarded to the pinned IP directly.
 */
import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns/promises';
import { isPrivateOrReservedHost } from '@leadguard/shared';

export class SsrfSafeProxyBlockedError extends Error {
  constructor(
    public readonly hostname: string,
    reason: string
  ) {
    super(`SSRF-safe proxy blocked ${hostname}: ${reason}`);
    this.name = 'SsrfSafeProxyBlockedError';
  }
}

export interface SsrfSafeProxy {
  /** e.g. "http://127.0.0.1:54321" — pass as Playwright's `proxy.server`. */
  url: string;
  port: number;
  /** Hostnames blocked since the proxy started, most recent last — for logging/telemetry, never exposed to the audited page. */
  blockedHosts: string[];
  close(): Promise<void>;
}

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Same bypass condition `resolveAndValidateExternalUrl` already applies —
 * this must match exactly, or every existing local-fixture-server-backed
 * Playwright test (which navigates to http://127.0.0.1:<port>) breaks
 * against a proxy that (correctly, for production) rejects loopback.
 */
function localFixturesBypassActive(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_FIXTURES === 'true';
}

async function resolvePinnedAddress(hostname: string): Promise<string> {
  if (localFixturesBypassActive()) {
    // Nothing to validate/pin in test/dev fixture mode — resolve normally
    // and let the OS pick, matching the no-op bypass in url-security.ts.
    if (net.isIP(hostname) !== 0) return hostname;
    const resolved = await dns.lookup(hostname, { all: true }).catch(() => []);
    return resolved[0]?.address ?? hostname;
  }

  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost') throw new SsrfSafeProxyBlockedError(hostname, 'localhost is not a permitted destination');

  const literalFamily = net.isIP(host);
  if (literalFamily !== 0) {
    if (isPrivateOrReservedHost(host)) {
      throw new SsrfSafeProxyBlockedError(hostname, 'literal IP is private/reserved');
    }
    return host;
  }

  if (isPrivateOrReservedHost(host)) {
    // Catches non-IP forms private4/private6 might still match (defensive;
    // the regexes are IP-shaped, but keeps this function self-contained and
    // correct even if that changes).
    throw new SsrfSafeProxyBlockedError(hostname, 'hostname is blocked');
  }

  const resolved = await dns.lookup(host, { all: true }).catch(() => []);
  if (resolved.length === 0) {
    throw new SsrfSafeProxyBlockedError(hostname, 'DNS resolution failed or returned no addresses');
  }
  const safe = resolved.find((r) => !isPrivateOrReservedHost(r.address));
  if (!safe) {
    throw new SsrfSafeProxyBlockedError(hostname, 'every resolved address is private/reserved');
  }
  // Pin to the first confirmed-safe address — the same "pin to one validated
  // address, never re-resolve at connect time" contract pinned-fetch.ts uses.
  return safe.address;
}

function parseHostPort(hostPort: string, defaultPort: number): { hostname: string; port: number } {
  // IPv6 literal in bracket form, e.g. "[::1]:443"
  const bracketMatch = /^\[([^\]]+)\](?::(\d+))?$/.exec(hostPort);
  if (bracketMatch) {
    return { hostname: bracketMatch[1]!, port: bracketMatch[2] ? Number(bracketMatch[2]) : defaultPort };
  }
  const lastColon = hostPort.lastIndexOf(':');
  if (lastColon === -1) return { hostname: hostPort, port: defaultPort };
  const maybePort = hostPort.slice(lastColon + 1);
  if (/^\d+$/.test(maybePort)) {
    return { hostname: hostPort.slice(0, lastColon), port: Number(maybePort) };
  }
  return { hostname: hostPort, port: defaultPort };
}

export async function startSsrfSafeProxy(): Promise<SsrfSafeProxy> {
  const blockedHosts: string[] = [];

  const server = http.createServer((req, res) => {
    // Plain-HTTP absolute-URI request forwarded through the proxy.
    (async () => {
      if (!req.url) {
        res.writeHead(400).end();
        return;
      }
      let target: URL;
      try {
        target = new URL(req.url);
      } catch {
        res.writeHead(400).end();
        return;
      }

      let pinnedIp: string;
      try {
        pinnedIp = await resolvePinnedAddress(target.hostname);
      } catch (err) {
        blockedHosts.push(target.hostname);
        res.writeHead(403, { 'content-type': 'text/plain' }).end('Blocked by SSRF-safe proxy');
        return;
      }

      const upstreamReq = http.request(
        {
          host: pinnedIp,
          port: target.port ? Number(target.port) : 80,
          method: req.method,
          path: `${target.pathname}${target.search}`,
          headers: { ...req.headers, host: target.host },
        },
        (upstreamRes) => {
          res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
          upstreamRes.pipe(res);
        }
      );
      upstreamReq.on('error', () => res.destroy());
      req.pipe(upstreamReq);
    })().catch(() => {
      try {
        res.destroy();
      } catch {
        // best-effort
      }
    });
  });

  server.on('connect', (req, clientSocket, head) => {
    (async () => {
      const { hostname, port } = parseHostPort(req.url ?? '', 443);
      let pinnedIp: string;
      try {
        pinnedIp = await resolvePinnedAddress(hostname);
      } catch {
        blockedHosts.push(hostname);
        clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        clientSocket.destroy();
        return;
      }

      const upstream = net.connect(port, pinnedIp);
      const timer = setTimeout(() => upstream.destroy(new Error('CONNECT_TIMEOUT')), CONNECT_TIMEOUT_MS);

      upstream.on('connect', () => {
        clearTimeout(timer);
      });
      upstream.once('ready', () => {
        clearTimeout(timer);
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => {
        clearTimeout(timer);
        try {
          clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        } catch {
          // socket may already be gone
        }
        clientSocket.destroy();
      });
      clientSocket.on('error', () => upstream.destroy());
    })().catch(() => {
      try {
        clientSocket.destroy();
      } catch {
        // best-effort
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    blockedHosts,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Force-close any lingering keep-alive connections rather than
        // waiting indefinitely for them to drain.
        server.closeAllConnections?.();
      }),
  };
}
