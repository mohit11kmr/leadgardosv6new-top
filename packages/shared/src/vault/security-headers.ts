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
    businessImpact: 'Weak or malformed security policies silently fail to protect visitors.',
  };
}

/**
 * Phase 0/1 extension of the core security-header scanner: looks at CSP
 * quality (report-only vs enforced), permissions-policy presence, and
 * malformed/duplicated header values.
 */
export const securityHeaderAuditScanner: VaultScanner = {
  key: 'SEC_HEADER_AUDIT',
  phase: 1,
  name: 'Security Header Quality',
  probe(facts: VaultProbeFacts): VaultFinding[] {
    const findings: VaultFinding[] = [];
    const page = facts.page;
    if (!page) return findings;
    const headers = page.headers;
    const websiteUrl = page.url || facts.websiteUrl;

    // 1. CSP present but only report-only (not enforced).
    const cspReport = headers['content-security-policy-report-only'];
    if (cspReport && cspReport.trim()) {
      const meta = detectionKey('SEC_CSP_REPORT')!;
      findings.push(
        baseFinding(
          meta,
          'Content-Security-Policy is report-only, not enforced',
          'The site sends CSP only in report-only mode, so violations are not blocked.',
          'content-security-policy-report-only present; no enforced content-security-policy.',
          'Report-only CSP does not actually block XSS/data-injection; attackers are unaffected.',
          'Migrate an enforced Content-Security-Policy once violations are reviewed.',
          websiteUrl,
          { header: 'content-security-policy-report-only' }
        )
      );
    }

    // 2. Permissions-Policy missing (browser capability exposure).
    const pp = headers['permissions-policy'];
    if (!pp || !pp.trim()) {
      const meta = detectionKey('SEC_POLICY_MALFORMED')!;
      findings.push(
        baseFinding(
          meta,
          'Permissions-Policy header missing',
          'The site does not restrict browser feature access (camera, microphone, geolocation).',
          'No permissions-policy header present.',
          'Without Permissions-Policy, any third-party script can request sensitive browser capabilities.',
          'Add a Permissions-Policy header disabling unused APIs, e.g. camera=(), microphone=(), geolocation=().',
          websiteUrl,
          { header: 'permissions-policy' }
        )
      );
    }

    // 3. Malformed / duplicated security header values.
    for (const [header, value] of Object.entries(headers)) {
      if (!['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options'].includes(header)) {
        continue;
      }
      const trimmed = value.trim();
      const malformed =
        !trimmed ||
        /\s+;/g.test(trimmed) ||
        (header === 'x-frame-options' && !/^(DENY|SAMEORIGIN)$/i.test(trimmed)) ||
        (header === 'x-content-type-options' && !/^nosniff$/i.test(trimmed)) ||
        (header === 'strict-transport-security' && !trimmed.includes('max-age='));
      if (malformed) {
        const meta = detectionKey('SEC_POLICY_MALFORMED')!;
        findings.push(
          baseFinding(
            meta,
            `Malformed ${header} header value`,
            `The ${header} header has an invalid or empty value and will not be honored by browsers.`,
            `Provided value: "${trimmed}".`,
            'Malformed policy/security headers are silently ignored, leaving the protection off.',
            'Correct the header value to a valid, enforced policy.',
            websiteUrl,
            { header, value: trimmed }
          )
        );
      }
    }

    return findings;
  },
};
