import { describe, it, expect } from 'vitest';
import { sslHealthScanner, type VaultFinding, type VaultProbeFacts } from '@leadguard/shared';

function sslFacts(overrides: Partial<VaultProbeFacts> = {}): VaultProbeFacts {
  return {
    websiteUrl: 'https://example.com/',
    tls: {
      isHttps: true,
      certificateValid: true,
      daysRemaining: 120,
      protocolVersion: 'TLSv1.3',
      weakCipher: false,
      hsts: 'max-age=31536000; includeSubDomains',
    },
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard: ssl-health scanner (LG-038)', () => {
  it('reports an expired certificate as HIGH', () => {
    const facts = sslFacts({ tls: { isHttps: true, certificateValid: false, daysRemaining: -5, protocolVersion: 'TLSv1.3' } });
    const findings = sslHealthScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_EXPIRED_CERT');
    expect(findings.find((f) => f.normalizedIssueKey === 'SEC_EXPIRED_CERT')?.severity).toBe('HIGH');
  });

  it('warns when the certificate expires within 30 days', () => {
    const facts = sslFacts({ tls: { isHttps: true, certificateValid: true, daysRemaining: 12, protocolVersion: 'TLSv1.3' } });
    const findings = sslHealthScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_EXPIRED_CERT');
  });

  it('flags deprecated TLS 1.0 / weak ciphers', () => {
    const facts = sslFacts({ tls: { isHttps: true, certificateValid: true, daysRemaining: 90, protocolVersion: 'TLSv1.0', weakCipher: true } });
    const findings = sslHealthScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_WEAK_TLS');
  });

  it('flags missing HSTS', () => {
    const facts = sslFacts({ tls: { isHttps: true, certificateValid: true, daysRemaining: 90, hsts: '' } });
    const findings = sslHealthScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_MISSING_HSTS');
  });

  it('flags a too-short HSTS max-age', () => {
    const facts = sslFacts({ tls: { isHttps: true, certificateValid: true, daysRemaining: 90, hsts: 'max-age=300' } });
    const findings = sslHealthScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_MISSING_HSTS');
  });

  it('produces zero findings for a clean TLS configuration', () => {
    const facts = sslFacts();
    expect(sslHealthScanner.probe(facts)).toHaveLength(0);
  });

  it('is a no-op when no TLS facts are collected (http-only target)', () => {
    const facts: VaultProbeFacts = { websiteUrl: 'http://example.com/' };
    expect(sslHealthScanner.probe(facts)).toHaveLength(0);
  });
});
