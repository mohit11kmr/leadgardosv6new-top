import { detectionKey } from './registry.js';
import type { LoginFormFacts, VaultFinding, VaultProbeFacts, VaultScanner } from './types.js';

function baseFinding(
  meta: { key: string; severity: string; scoreImpact: number; cwe: string; cvssVector: string; cvssScore: number },
  title: string,
  description: string,
  observed: string,
  why: string,
  recommendation: string,
  affectedUrl: string,
  metadata: Record<string, unknown> = {}
): VaultFinding {
  return {
    ruleId: 'LG-038',
    internalKey: meta.key,
    normalizedIssueKey: meta.key,
    category: 'SECURITY',
    scope: 'WEBSITE',
    severity: meta.severity as VaultFinding['severity'],
    title,
    description,
    affectedUrl,
    evidence: {
      source: 'vault-probe',
      observed,
      location: affectedUrl,
      why,
      recommendation,
      metadata,
    },
    recommendation,
    scoreImpact: meta.scoreImpact,
    cwe: meta.cwe,
    cvssVector: meta.cvssVector,
    cvssScore: meta.cvssScore,
    businessImpact: 'Weak authentication controls allow account takeover and credential-stuffing against real users.',
  };
}

/**
 * Phase 1 host-level scanner: evaluates discovered login/authentication
 * forms for brute-force throttling, CSRF protection, and secure session
 * cookies. Operates on pre-collected `LoginFormFacts` for offline testing.
 */
export const authGuardScanner: VaultScanner = {
  key: 'SEC_AUTH_GUARD',
  phase: 1,
  name: 'Authentication Guards',
  probe(facts: VaultProbeFacts): VaultFinding[] {
    const findings: VaultFinding[] = [];
    const forms = facts.loginForms ?? [];
    if (forms.length === 0) return findings;

    for (const form of forms) {
      const affectedUrl = form.action || facts.websiteUrl;

      if (!form.hasThrottle) {
        const meta = detectionKey('SEC_NO_AUTH_RATE_LIMIT')!;
        findings.push(
          baseFinding(
            meta,
            'Login form has no rate limiting / brute-force protection',
            'The authentication endpoint does not indicate throttling or lockout protections.',
            'No 429 / Retry-After throttle evidence on the login action.',
            'Without throttling, attackers can run unlimited password guesses and credential-stuffing.',
            'Add rate limiting, account lockout, and CAPTCHA to the authentication endpoint.',
            affectedUrl,
            { action: form.action }
          )
        );
      }

      if (!form.hasCsrfToken) {
        const meta = detectionKey('SEC_INSECURE_AUTH_COOKIE')!;
        findings.push(
          baseFinding(
            meta,
            'Login form missing CSRF token',
            'The authentication form has no CSRF token protection.',
            'No anti-CSRF token field present on the login form.',
            'Absent CSRF protection enables cross-site request forgery against authenticated actions.',
            'Include a server-validated CSRF token on the login form and all state-changing requests.',
            affectedUrl,
            { action: form.action }
          )
        );
      }

      if (form.cookie && !form.cookie.secure) {
        const meta = detectionKey('SEC_INSECURE_AUTH_COOKIE')!;
        findings.push(
          baseFinding(
            meta,
            'Session cookie lacks Secure flag',
            'The authentication cookie is not restricted to HTTPS.',
            'Cookie flags inspected: Secure=false.',
            'A session cookie without Secure can be transmitted over cleartext HTTP and intercepted.',
            'Set the Secure flag on all authentication/session cookies.',
            affectedUrl,
            { cookie: form.cookie }
          )
        );
      }

      if (form.cookie && !form.cookie.httpOnly) {
        const meta = detectionKey('SEC_INSECURE_AUTH_COOKIE')!;
        findings.push(
          baseFinding(
            meta,
            'Session cookie lacks HttpOnly flag',
            'The authentication cookie is readable by JavaScript.',
            'Cookie flags inspected: HttpOnly=false.',
            'An HttpOnly-less cookie can be exfiltrated via XSS.',
            'Set the HttpOnly flag on all authentication/session cookies.',
            affectedUrl,
            { cookie: form.cookie }
          )
        );
      }
    }

    return findings;
  },
};
