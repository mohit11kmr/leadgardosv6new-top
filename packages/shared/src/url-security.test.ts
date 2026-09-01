import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateExternalUrl, resolveAndValidateExternalUrl, isPrivateOrReservedHost } from './url-security.js';

// These tests exercise the real SSRF validation path, so they must run with
// the ALLOW_LOCAL_FIXTURES bypass OFF (it's on globally for the rest of the
// suite — see tests/global-setup.ts) — otherwise every host, including the
// ones under test here, would be waved through.
describe('SEC-2: isPrivateOrReservedHost — IPv4-mapped IPv6', () => {
  it('blocks IPv4-mapped loopback (::ffff:127.0.0.1)', () => {
    expect(isPrivateOrReservedHost('::ffff:127.0.0.1')).toBe(true);
  });

  it('blocks IPv4-mapped RFC1918 private (::ffff:10.0.0.1)', () => {
    expect(isPrivateOrReservedHost('::ffff:10.0.0.1')).toBe(true);
  });

  it('blocks IPv4-mapped link-local / cloud metadata (::ffff:169.254.169.254)', () => {
    expect(isPrivateOrReservedHost('::ffff:169.254.169.254')).toBe(true);
  });

  it('blocks IPv4-mapped RFC1918 private (::ffff:192.168.1.1)', () => {
    expect(isPrivateOrReservedHost('::ffff:192.168.1.1')).toBe(true);
  });

  it('blocks the pure-hex embedded form of a mapped private address (::ffff:a00:1 = 10.0.0.1)', () => {
    expect(isPrivateOrReservedHost('::ffff:a00:1')).toBe(true);
  });

  it('blocks ordinary (non-mapped) IPv6 loopback/private forms — regression, must not break the existing check', () => {
    expect(isPrivateOrReservedHost('::1')).toBe(true);
    expect(isPrivateOrReservedHost('fe80::1')).toBe(true);
    expect(isPrivateOrReservedHost('fd00::1')).toBe(true);
  });

  it('allows a legitimate public IPv4-mapped IPv6 address (::ffff:8.8.8.8, Google DNS)', () => {
    expect(isPrivateOrReservedHost('::ffff:8.8.8.8')).toBe(false);
  });

  it('allows a legitimate public plain IPv6 address', () => {
    expect(isPrivateOrReservedHost('2001:4860:4860::8888')).toBe(false); // Google public DNS
  });

  it('allows a legitimate public IPv4 address', () => {
    expect(isPrivateOrReservedHost('8.8.8.8')).toBe(false);
  });
});

describe('validateExternalUrl / resolveAndValidateExternalUrl — end-to-end host validation', () => {
  let previousAllowFixtures: string | undefined;
  let previousNodeEnv: string | undefined;

  beforeEach(() => {
    previousAllowFixtures = process.env.ALLOW_LOCAL_FIXTURES;
    previousNodeEnv = process.env.NODE_ENV;
    delete process.env.ALLOW_LOCAL_FIXTURES;
  });

  afterEach(() => {
    if (previousAllowFixtures !== undefined) process.env.ALLOW_LOCAL_FIXTURES = previousAllowFixtures;
    else delete process.env.ALLOW_LOCAL_FIXTURES;
    if (previousNodeEnv !== undefined) process.env.NODE_ENV = previousNodeEnv;
  });

  it('rejects a URL whose literal hostname is an IPv4-mapped-IPv6 loopback address', async () => {
    await expect(validateExternalUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/private/i);
  });

  it('rejects a URL whose literal hostname is an IPv4-mapped-IPv6 metadata address', async () => {
    await expect(validateExternalUrl('http://[::ffff:169.254.169.254]/')).rejects.toThrow(/private/i);
  });

  it('rejects plain private IPv4 literals (regression, unrelated to the mapped-IPv6 fix)', async () => {
    await expect(validateExternalUrl('http://127.0.0.1/')).rejects.toThrow(/private/i);
    await expect(validateExternalUrl('http://10.0.0.1/')).rejects.toThrow(/private/i);
    await expect(validateExternalUrl('http://192.168.1.1/')).rejects.toThrow(/private/i);
    await expect(validateExternalUrl('http://169.254.169.254/')).rejects.toThrow(/private/i);
  });

  it('rejects plain IPv6 loopback literal (regression)', async () => {
    await expect(validateExternalUrl('http://[::1]/')).rejects.toThrow(/private/i);
  });

  it('accepts a legitimate public IP literal (no DNS involved, deterministic)', async () => {
    const url = await validateExternalUrl('http://8.8.8.8/');
    expect(url.hostname).toBe('8.8.8.8');
  });

  it('SEC-1 foundation: resolveAndValidateExternalUrl returns the exact literal address to pin to, for an IP-literal URL', async () => {
    const target = await resolveAndValidateExternalUrl('http://8.8.8.8/');
    expect(target.addresses).toEqual(['8.8.8.8']);
    expect(target.family).toBe(4);
  });

  it('ALLOW_LOCAL_FIXTURES bypass (dev/test only) returns an empty address list — nothing to pin', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_LOCAL_FIXTURES = 'true';
    const target = await resolveAndValidateExternalUrl('http://127.0.0.1:9/');
    expect(target.addresses).toEqual([]);
  });
});
