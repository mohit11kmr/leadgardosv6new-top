import dns from 'node:dns/promises';
import net from 'node:net';

const blocked = new Set(['metadata.google.internal', 'instance-data.ec2.internal']);
const private4 = /^(10\.|127\.|169\.254\.|192\.168\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/;
const private6 = /^(::1|fc|fd|fe80)/i;

/**
 * Extracts the embedded IPv4 address from an IPv4-mapped IPv6 literal —
 * either the dotted-decimal form (::ffff:127.0.0.1) or the pure-hex form
 * (::ffff:7f00:1, the canonical form some resolvers/stacks return for the
 * same address) — or null if `address` isn't in either mapped form.
 *
 * SEC-2 fix: `private6` alone never matched either form (its "does this
 * look like a private/loopback *IPv6* literal" prefixes don't apply to an
 * embedded IPv4 payload), so `::ffff:169.254.169.254` etc. previously sailed
 * through validation as if it were an ordinary, unclassified public IPv6
 * address. Unwrapping to the real IPv4 address and re-checking it against
 * the existing, already-correct `private4` regex closes the gap without
 * duplicating IPv4-range logic.
 */
function unwrapIPv4MappedIPv6(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address);
  if (dotted) return dotted[1]!;

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.');
  }
  return null;
}

/**
 * True if `host` (a hostname string or IP literal, IPv4 or IPv6, in any
 * form Node's own parsing would accept) is loopback, RFC1918 private,
 * link-local, or an IPv4-mapped-IPv6 wrapping one of those.
 */
export function isPrivateOrReservedHost(host: string): boolean {
  if (private4.test(host) || private6.test(host)) return true;
  const mapped = unwrapIPv4MappedIPv6(host);
  return mapped !== null && private4.test(mapped);
}

export interface ValidatedTarget {
  url: URL;
  /**
   * The exact IP address(es) confirmed safe by this validation call.
   * SEC-1: callers that actually open a connection MUST pin to one of
   * these (see packages/shared/src/server-only/pinned-fetch.ts) rather
   * than letting the HTTP client re-resolve the hostname itself — a
   * second, independent DNS lookup at connect time is exactly the
   * validate-then-fetch TOCTOU window a DNS-rebinding attack exploits
   * (return a safe address for validation, a private/metadata address,
   * moments later, for the real connection).
   * Empty when the ALLOW_LOCAL_FIXTURES bypass applied (dev/test only) —
   * there is nothing meaningful to pin in that case.
   */
  addresses: string[];
  family: 4 | 6;
}

/**
 * Validates a user-supplied URL AND resolves+returns the specific address
 * this validation pass confirmed safe, in one atomic pass — the only way to
 * avoid re-introducing the same TOCTOU gap this exists to close (a second,
 * separate DNS lookup after the fact would just move the race, not remove
 * it).
 */
export async function resolveAndValidateExternalUrl(value: string): Promise<ValidatedTarget> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only credential-free HTTP(S) URLs are allowed');
  }

  // Allow loopback for controlled testing environments when explicitly enabled.
  // Never honored in production to prevent SSRF via a misconfigured flag.
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_FIXTURES === 'true') {
    return { url, addresses: [], family: 4 };
  }

  // WHATWG URL.hostname keeps the brackets for an IPv6 literal (e.g. "[::1]"),
  // but every classification below (net.isIP, the private4/private6 regexes,
  // the IPv4-mapped-IPv6 unwrap) expects the bare address form — matching a
  // bracketed string against them silently fails and falls through to the
  // DNS-lookup branch below with a malformed hostname. Strip brackets before
  // any check so an IPv6 literal is actually classified, not accidentally
  // waved through (or merely failing for the wrong, fragile reason).
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (host === 'localhost' || blocked.has(host) || isPrivateOrReservedHost(host)) {
    throw new Error('Private or metadata hosts are not allowed');
  }

  const literalFamily = net.isIP(host);
  if (literalFamily !== 0) {
    return { url, addresses: [host], family: literalFamily === 6 ? 6 : 4 };
  }

  const resolved = await dns.lookup(host, { all: true });
  if (resolved.length === 0) {
    throw new Error('Host did not resolve to any address');
  }
  if (resolved.some(({ address }) => isPrivateOrReservedHost(address))) {
    throw new Error('Host resolves to a private address');
  }

  return {
    url,
    addresses: resolved.map((r) => r.address),
    family: resolved[0]!.family === 6 ? 6 : 4,
  };
}

/**
 * Validation-only convenience wrapper preserving the original signature/
 * behavior for callers that don't perform the actual network connection
 * themselves (e.g. pure "is this URL allowed" checks) and therefore have
 * nothing to pin.
 */
export async function validateExternalUrl(value: string): Promise<URL> {
  const target = await resolveAndValidateExternalUrl(value);
  return target.url;
}
