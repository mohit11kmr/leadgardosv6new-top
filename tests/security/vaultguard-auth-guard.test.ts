import { describe, it, expect } from 'vitest';
import { authGuardScanner, type VaultFinding, type VaultProbeFacts } from '@leadguard/shared';

function loginFacts(overrides: Partial<VaultProbeFacts> = {}): VaultProbeFacts {
  return {
    websiteUrl: 'https://example.com/',
    loginForms: [
      {
        action: 'https://example.com/login',
        hasThrottle: true,
        hasCsrfToken: true,
        cookie: { httpOnly: true, secure: true, sameSite: 'Lax' },
      },
    ],
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard: auth-guard scanner (LG-038)', () => {
  it('flags a login form with no rate limiting', () => {
    const facts = loginFacts({ loginForms: [{ action: 'https://example.com/login', hasThrottle: false, hasCsrfToken: true, cookie: { httpOnly: true, secure: true } }] });
    const findings = authGuardScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_NO_AUTH_RATE_LIMIT');
  });

  it('flags a login form with no CSRF token', () => {
    const facts = loginFacts({ loginForms: [{ action: 'https://example.com/login', hasThrottle: true, hasCsrfToken: false, cookie: { httpOnly: true, secure: true } }] });
    const findings = authGuardScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_INSECURE_AUTH_COOKIE');
  });

  it('flags session cookies lacking Secure and HttpOnly flags', () => {
    const facts = loginFacts({
      loginForms: [{ action: 'https://example.com/login', hasThrottle: true, hasCsrfToken: true, cookie: { httpOnly: false, secure: false, sameSite: 'None' } }],
    });
    const findings = authGuardScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_INSECURE_AUTH_COOKIE');
    expect(findings.filter((f) => f.normalizedIssueKey === 'SEC_INSECURE_AUTH_COOKIE')).toHaveLength(2);
  });

  it('produces zero findings for a hardened login form', () => {
    expect(authGuardScanner.probe(loginFacts())).toHaveLength(0);
  });

  it('is a no-op when no login forms are found', () => {
    const facts: VaultProbeFacts = { websiteUrl: 'https://example.com/' };
    expect(authGuardScanner.probe(facts)).toHaveLength(0);
  });
});
