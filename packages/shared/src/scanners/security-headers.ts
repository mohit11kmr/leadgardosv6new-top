import type { Finding, Severity, PageRecord, ScannerContext, ScannerResult } from '../types.js';

export interface HeaderDefinition {
  header: string;
  label: string;
  internalKey: string;
  normalizedIssueKey: string;
  severity: Severity;
  scoreImpact: number;
  why: string;
  recommendation: string;
}

export const SECURITY_HEADER_DEFS: HeaderDefinition[] = [
  {
    header: 'content-security-policy',
    label: 'Content-Security-Policy (CSP)',
    internalKey: 'SEC_HEADER_CSP',
    normalizedIssueKey: 'SEC_HEADER_CSP',
    severity: 'MEDIUM',
    scoreImpact: 5,
    why: 'CSP prevents Cross-Site Scripting (XSS), data injection, and rogue script execution.',
    recommendation: 'Configure a restrictive Content-Security-Policy header defining trusted script, style, and media sources.',
  },
  {
    header: 'strict-transport-security',
    label: 'Strict-Transport-Security (HSTS)',
    internalKey: 'SEC_HEADER_HSTS',
    normalizedIssueKey: 'SEC_HEADER_HSTS',
    severity: 'LOW',
    scoreImpact: 4,
    why: 'HSTS instructs browsers to strictly communicate over HTTPS, protecting against SSL-stripping attacks.',
    recommendation: 'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains" to all HTTPS responses.',
  },
  {
    header: 'x-frame-options',
    label: 'X-Frame-Options',
    internalKey: 'SEC_HEADER_XFO',
    normalizedIssueKey: 'SEC_HEADER_XFO',
    severity: 'LOW',
    scoreImpact: 3,
    why: 'X-Frame-Options protects users against clickjacking attacks by controlling whether the site can be embedded in iframes.',
    recommendation: 'Add "X-Frame-Options: SAMEORIGIN" or "DENY" to prevent unauthorized framing.',
  },
  {
    header: 'x-content-type-options',
    label: 'X-Content-Type-Options',
    internalKey: 'SEC_HEADER_XCTO',
    normalizedIssueKey: 'SEC_HEADER_XCTO',
    severity: 'LOW',
    scoreImpact: 2,
    why: 'X-Content-Type-Options: nosniff prevents MIME-type sniffing vulnerabilities in browsers.',
    recommendation: 'Add "X-Content-Type-Options: nosniff" to all HTTP responses.',
  },
  {
    header: 'referrer-policy',
    label: 'Referrer-Policy',
    internalKey: 'SEC_HEADER_RP',
    normalizedIssueKey: 'SEC_HEADER_RP',
    severity: 'LOW',
    scoreImpact: 2,
    why: 'Referrer-Policy controls how much referrer information is sent along with requests, preventing sensitive data leakage.',
    recommendation: 'Add "Referrer-Policy: strict-origin-when-cross-origin" or "no-referrer-when-downgrade".',
  },
  {
    header: 'permissions-policy',
    label: 'Permissions-Policy',
    internalKey: 'SEC_HEADER_PP',
    normalizedIssueKey: 'SEC_HEADER_PP',
    severity: 'LOW',
    scoreImpact: 2,
    why: 'Permissions-Policy restricts access to sensitive browser features (camera, microphone, geolocation).',
    recommendation: 'Add a Permissions-Policy header disabling unused browser APIs (e.g. camera=(), microphone=(), geolocation=()).',
  },
];

export interface SecurityHeadersScanResult {
  findings: Finding[];
  presentHeaders: string[];
  missingHeaders: string[];
}

export function scanSecurityHeaders(page: PageRecord, _context?: ScannerContext): SecurityHeadersScanResult {
  const findings: Finding[] = [];
  const presentHeaders: string[] = [];
  const missingHeaders: string[] = [];

  const headers = page.headers;

  for (const def of SECURITY_HEADER_DEFS) {
    const value = headers[def.header];
    if (value && value.trim()) {
      presentHeaders.push(def.header);
    } else {
      missingHeaders.push(def.header);
      findings.push({
        ruleId: 'LG-014',
        internalKey: def.internalKey,
        normalizedIssueKey: def.normalizedIssueKey,
        category: 'SECURITY',
        scope: 'WEBSITE',
        severity: def.severity,
        title: `${def.label} header missing`,
        description: `The HTTP response did not include the ${def.label} security header.`,
        affectedUrl: page.url,
        evidence: {
          source: 'response-header',
          observed: `Header "${def.header}" not present in HTTP response`,
          location: page.url,
          why: def.why,
          recommendation: def.recommendation,
          metadata: { headerName: def.header },
        },
        recommendation: def.recommendation,
        scoreImpact: def.scoreImpact,
        businessImpact: 'Browser security protections are left undeclared, reducing defense-in-depth security posture.',
      });
    }
  }

  return {
    findings,
    presentHeaders,
    missingHeaders,
  };
}

export function runSecurityHeadersScanner(page: PageRecord, context?: ScannerContext): ScannerResult {
  try {
    const res = scanSecurityHeaders(page, context);
    return {
      scannerKey: 'SECURITY_HEADERS',
      status: 'COMPLETED',
      findings: res.findings,
      metrics: {
        presentHeaders: res.presentHeaders.join(','),
        missingCount: res.missingHeaders.length,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'SECURITY_HEADERS',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown scanner error',
    };
  }
}
