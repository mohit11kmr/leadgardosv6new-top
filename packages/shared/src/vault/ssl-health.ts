import { detectionKey } from './registry.js';
import type { VaultFinding, VaultProbeFacts, VaultScanner } from './types.js';

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
    businessImpact: 'Browsers block or warn on weak/broken TLS, eroding visitor trust and enabling interception.',
  };
}

const EXPIRY_WARN_DAYS = 30;

/**
 * Phase 1 host-level scanner: evaluates TLS certificate health (expiry,
 * weak protocol/ciphers) and HSTS presence, from collected TLS facts.
 */
export const sslHealthScanner: VaultScanner = {
  key: 'SEC_SSL_HEALTH',
  phase: 1,
  name: 'SSL/TLS Health',
  probe(facts: VaultProbeFacts): VaultFinding[] {
    const findings: VaultFinding[] = [];
    const tls = facts.tls;
    if (!tls) return findings;
    const websiteUrl = facts.websiteUrl;

    // 1. Expired or expiring certificate.
    if (!tls.certificateValid && tls.daysRemaining !== undefined && tls.daysRemaining <= 0) {
      const meta = detectionKey('SEC_EXPIRED_CERT')!;
      findings.push(
        baseFinding(
          meta,
          'SSL/TLS certificate expired',
          `The SSL certificate expired ${Math.abs(tls.daysRemaining)} days ago.`,
          `Certificate validity remaining: ${tls.daysRemaining} days.`,
          'An expired certificate triggers full-page browser security blocks and enables interception.',
          'Renew the certificate now and set up auto-renewal well before expiry.',
          websiteUrl,
          { daysRemaining: tls.daysRemaining }
        )
      );
    } else if (tls.daysRemaining !== undefined && tls.daysRemaining <= EXPIRY_WARN_DAYS) {
      const meta = detectionKey('SEC_EXPIRED_CERT')!;
      findings.push(
        baseFinding(
          meta,
          'SSL/TLS certificate expiring soon',
          `The SSL certificate expires in ${tls.daysRemaining} days.`,
          `Certificate validity remaining: ${tls.daysRemaining} days.`,
          'Certificates expiring within 30 days risk an unplanned outage and security warning window.',
          'Renew before expiry and configure auto-renewal.',
          websiteUrl,
          { daysRemaining: tls.daysRemaining }
        )
      );
    }

    // 2. Weak protocol / cipher.
    if (tls.weakCipher || (tls.protocolVersion && /TLSv1[.0,1]?$/.test(tls.protocolVersion))) {
      const meta = detectionKey('SEC_WEAK_TLS')!;
      findings.push(
        baseFinding(
          meta,
          'Deprecated TLS protocol or weak cipher in use',
          `TLS is negotiated with an insecure protocol/cipher (${tls.protocolVersion ?? 'unknown'}).`,
          `Negotiated ${tls.protocolVersion ?? 'unknown'} with weak cipher suite.`,
          'TLS 1.0/1.1 and CBC suites are cryptographically broken and blocked by modern clients.',
          'Disable TLS 1.0/1.1 and weak CBC suites; require TLS 1.2+ with modern AEAD ciphers.',
          websiteUrl,
          { protocolVersion: tls.protocolVersion, weakCipher: tls.weakCipher }
        )
      );
    }

    // 3. Missing / short HSTS.
    const hsts = tls.hsts ?? facts.page?.headers?.['strict-transport-security'];
    if (!hsts || !hsts.trim()) {
      const meta = detectionKey('SEC_MISSING_HSTS')!;
      findings.push(
        baseFinding(
          meta,
          'Strict-Transport-Security missing',
          'The site does not send an HSTS header (or sends an empty one).',
          'No strict-transport-security header present.',
          'Without HSTS, browsers and users are exposed to SSL-stripping and first-request downgrade attacks.',
          'Send "Strict-Transport-Security: max-age=31536000; includeSubDomains" on HTTPS responses.',
          websiteUrl,
          { hsts: hsts ?? null }
        )
      );
    } else if (/max-age=(\d+)/.test(hsts)) {
      const maxAge = Number(/max-age=(\d+)/.exec(hsts)![1]);
      if (maxAge < 31536000) {
        const meta = detectionKey('SEC_MISSING_HSTS')!;
        findings.push(
          baseFinding(
            meta,
            'Strict-Transport-Security max-age too short',
            `HSTS max-age is ${maxAge}s; a short window reduces SSL-stripping protection.`,
            `Provided HSTS: "${hsts}".`,
            'A short max-age weakens HSTS protection against downgrade attacks.',
            'Raise max-age to at least 31536000 (1 year).',
            websiteUrl,
            { maxAge }
          )
        );
      }
    }

    return findings;
  },
};
