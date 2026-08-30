import dns from 'node:dns/promises';
import net from 'node:net';

const blocked = new Set(['metadata.google.internal', 'instance-data.ec2.internal']);
const private4 = /^(10\.|127\.|169\.254\.|192\.168\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/;
const private6 = /^(::1|fc|fd|fe80)/i;

export async function validateExternalUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only credential-free HTTP(S) URLs are allowed');
  }

  // Allow loopback for controlled testing environments when explicitly enabled.
  // Never honored in production to prevent SSRF via a misconfigured flag.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_LOCAL_FIXTURES === 'true'
  ) {
    return url;
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || blocked.has(host) || private4.test(host) || private6.test(host)) {
    throw new Error('Private or metadata hosts are not allowed');
  }

  if (net.isIP(host) === 0) {
    const addresses = await dns.lookup(host, { all: true });
    if (addresses.some(({ address }) => private4.test(address) || private6.test(address))) {
      throw new Error('Host resolves to a private address');
    }
  }

  return url;
}
