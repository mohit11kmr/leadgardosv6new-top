import { describe, it, expect } from 'vitest';
import { securityHeaderAuditScanner, collectVaultFindings, type VaultProbeFacts, type VaultFinding } from '@leadguard/shared';

function headerFacts(overrides: Partial<VaultProbeFacts> = {}): VaultProbeFacts {
  return {
    websiteUrl: 'https://example.com/',
    page: {
      url: 'https://example.com/',
      statusCode: 200,
      headers: {
        'content-security-policy': "default-src 'self'",
        'strict-transport-security': 'max-age=31536000',
        'x-frame-options': 'SAMEORIGIN',
        'x-content-type-options': 'nosniff',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      },
      html: '<html/>',
    },
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard: security-header quality scanner (LG-038)', () => {
  it('flags a CSP that is only report-only', () => {
    const facts = headerFacts({
      page: {
        url: 'https://example.com/', statusCode: 200, html: '<html/>',
        headers: { 'content-security-policy-report-only': "default-src 'none'" },
      },
    });
    const findings = securityHeaderAuditScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_CSP_REPORT');
  });

  it('flags missing Permissions-Policy', () => {
    const facts = headerFacts({
      page: {
        url: 'https://example.com/', statusCode: 200, html: '<html/>',
        headers: { 'content-security-policy': "default-src 'self'" },
      },
    });
    const findings = securityHeaderAuditScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_POLICY_MALFORMED');
  });

  it('flags a malformed X-Frame-Options value', () => {
    const facts = headerFacts({
      page: {
        url: 'https://example.com/', statusCode: 200, html: '<html/>',
        headers: { 'x-frame-options': 'ALLOWALL' },
      },
    });
    const findings = securityHeaderAuditScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_POLICY_MALFORMED');
  });

  it('produces zero findings for clean, enforced headers', () => {
    expect(securityHeaderAuditScanner.probe(headerFacts())).toHaveLength(0);
  });
});

describe('VaultGuard: probe orchestration', () => {
  it('collectVaultFindings aggregates across all scanners without cross-contamination', () => {
    const facts: VaultProbeFacts = {
      websiteUrl: 'https://example.com/',
      page: {
        url: 'https://example.com/', statusCode: 200, html: '<html/>',
        headers: { 'x-powered-by': 'Laravel/11' },
      },
      exposedAssets: [{ url: 'https://example.com/.env', status: 200, contentType: 'text/plain', detectedPath: '/.env' }],
    };
    const findings = collectVaultFindings(facts);
    expect(keys(findings)).toEqual(expect.arrayContaining(['SEC_SERVER_LEAK', 'SEC_DEBUG_MODE']));
  });
});
