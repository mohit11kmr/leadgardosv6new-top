import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';
import type { ValidatedTarget } from '../url-security.js';

export interface PinnedFetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

/**
 * SEC-1: performs the actual outbound HTTP(S) request pinned to the exact
 * IP address `resolveAndValidateExternalUrl` already confirmed safe — the
 * connection NEVER re-resolves the hostname via DNS. This is what closes
 * the validate-then-fetch TOCTOU gap: plain `fetch(url)` re-resolves the
 * hostname itself when it actually connects, which is a second, independent
 * DNS lookup a DNS-rebinding attacker can answer differently (a public
 * address for the first lookup used by validation, a private/metadata
 * address for the second one used by the real connection).
 *
 * TLS SNI and certificate hostname verification, and the outgoing `Host`
 * header, all still use the ORIGINAL hostname — only the low-level socket
 * destination is pinned via Node's native `lookup` connect option (a
 * built-in `http`/`https`/`net` capability, not a third-party HTTP stack).
 * This makes the fix transparent to the target server and to every existing
 * caller that just wants a standard Web `Response` back.
 *
 * Falls back to ordinary `fetch()` when `target.addresses` is empty, which
 * only happens under the ALLOW_LOCAL_FIXTURES dev/test bypass (see
 * url-security.ts) — there is nothing to pin in that case, and existing
 * local-server-backed tests must keep working unchanged.
 */
export function fetchPinned(target: ValidatedTarget, init: PinnedFetchInit = {}): Promise<Response> {
  if (target.addresses.length === 0) {
    return fetch(target.url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
      redirect: 'manual',
    });
  }

  const pinnedAddress = target.addresses[0]!;
  const isHttps = target.url.protocol === 'https:';
  const requestFn = isHttps ? https.request : http.request;

  return new Promise<Response>((resolve, reject) => {
    const req = requestFn(
      {
        hostname: target.url.hostname, // preserved for TLS SNI / certificate verification
        port: target.url.port || (isHttps ? 443 : 80),
        path: `${target.url.pathname}${target.url.search}`,
        method: init.method ?? 'GET',
        headers: { host: target.url.host, ...init.headers },
        // The pin: force this exact validated address for the connection,
        // instead of the default behavior of re-resolving `hostname` via
        // dns.lookup() at connect time.
        //
        // Node's Happy Eyeballs (autoSelectFamily, on by default since
        // Node 18.13) calls this function with `options.all: true`, which
        // requires the callback to receive an ARRAY of {address, family}
        // records rather than a single (err, address, family) triple —
        // passing the single-record shape in that mode leaves the internal
        // address list empty, surfacing as "Invalid IP address: undefined"
        // deep in net.Socket. Support both shapes so the pin holds
        // regardless of which calling convention Node uses.
        lookup: (
          _hostname: string,
          options: { all?: boolean },
          callback: (
            err: NodeJS.ErrnoException | null,
            address: string | { address: string; family: number }[],
            family?: number
          ) => void
        ) => {
          if (options.all) {
            callback(null, [{ address: pinnedAddress, family: target.family }]);
          } else {
            callback(null, pinnedAddress, target.family);
          }
        },
      } as http.RequestOptions,
      (res) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined) continue;
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else {
            headers.set(key, value);
          }
        }
        const body = Readable.toWeb(res) as ReadableStream<Uint8Array>;
        resolve(new Response(body, { status: res.statusCode ?? 0, statusText: res.statusMessage, headers }));
      }
    );

    req.on('error', (err) => reject(err));

    if (init.signal) {
      if (init.signal.aborted) {
        req.destroy(new Error('AbortError'));
      } else {
        init.signal.addEventListener('abort', () => req.destroy(new Error('AbortError')), { once: true });
      }
    }

    req.end(init.body);
  });
}
