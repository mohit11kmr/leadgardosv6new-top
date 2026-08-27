import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';

export interface TelephoneScanResult {
  findings: Finding[];
  hasTelLink: boolean;
  validLinksCount: number;
}

export function scanTelephone(page: PageRecord, _context?: ScannerContext): TelephoneScanResult {
  const findings: Finding[] = [];
  const html = page.html;

  // Extract all href="tel:..." links
  const telRegex = /href=["']tel:([^"']*)["']/gi;
  const rawMatches = [...html.matchAll(telRegex)].map((m) => m[1]?.trim() ?? '');
  const uniqueTelLinks = [...new Set(rawMatches)];

  let validLinksCount = 0;

  for (const rawPhone of uniqueTelLinks) {
    if (!rawPhone) {
      findings.push({
        ruleId: 'LG-003',
        internalKey: 'TEL_MALFORMED',
        normalizedIssueKey: 'TEL_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'Empty click-to-call link detected',
        description: 'A tel: link with no phone number was found.',
        affectedUrl: page.url,
        evidence: {
          source: 'href',
          observed: 'tel:',
          location: page.url,
          why: 'The href attribute is empty (href="tel:")',
          recommendation: 'Add a valid telephone number to the href attribute.',
          metadata: { rawPhone },
        },
        recommendation: 'Provide a valid phone number inside the tel: link.',
        scoreImpact: 12,
        businessImpact: 'Users tapping the call button will trigger a blank dialer or error.',
      });
      continue;
    }

    const digitsOnly = rawPhone.replace(/\D/g, '');

    // Check if truly malformed (e.g. invalid letters/symbols, less than 6 digits)
    const containsInvalidChars = /[^+\d\s().-]/.test(rawPhone);
    const tooFewDigits = digitsOnly.length < 6;

    if (containsInvalidChars || tooFewDigits) {
      findings.push({
        ruleId: 'LG-003',
        internalKey: 'TEL_MALFORMED',
        normalizedIssueKey: 'TEL_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'Telephone link appears malformed',
        description: `The telephone value "tel:${rawPhone}" contains invalid characters or insufficient digits.`,
        affectedUrl: page.url,
        evidence: {
          source: 'href',
          observed: `tel:${rawPhone}`,
          location: page.url,
          why: containsInvalidChars
            ? 'Contains non-phone characters or unencoded letters'
            : 'Phone number has fewer than 6 digits',
          recommendation: 'Use standard E.164 phone format (e.g. tel:+919876543210).',
          metadata: { rawPhone, digitsOnly },
        },
        recommendation: 'Use a valid international telephone URI (e.g., tel:+919876543210).',
        scoreImpact: 12,
        businessImpact: 'Mobile callers cannot dial the number, losing instant inbound leads.',
      });
      continue;
    }

    // Check if merely non-normalized (contains unstripped spaces, brackets, hyphens inside tel: URI)
    const hasUnstrippedFormatting = /[\s().-]/.test(rawPhone);
    if (hasUnstrippedFormatting) {
      findings.push({
        ruleId: 'LG-003',
        internalKey: 'TEL_NON_NORMALIZED',
        normalizedIssueKey: 'TEL_NON_NORMALIZED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Telephone link is not normalized',
        description: `The tel link contains spaces, parentheses, or dashes ("tel:${rawPhone}"). While some dialers handle this, strict RFC 3966 recommends clean E.164.`,
        affectedUrl: page.url,
        evidence: {
          source: 'href',
          observed: `tel:${rawPhone}`,
          location: page.url,
          why: 'Contains visual formatting characters (spaces, dashes, or parentheses) inside the URI',
          recommendation: `Normalize to tel:${rawPhone.startsWith('+') ? '+' : ''}${digitsOnly}`,
          metadata: { rawPhone, digitsOnly },
        },
        recommendation: 'Strip spaces, hyphens, and brackets from the tel: href.',
        scoreImpact: 3,
        businessImpact: 'Some older mobile browsers or VoIP apps may fail to dial formatted tel URIs.',
      });
    }

    validLinksCount += 1;
  }

  return {
    findings,
    hasTelLink: uniqueTelLinks.length > 0,
    validLinksCount,
  };
}

export function runTelephoneScanner(page: PageRecord, context?: ScannerContext): ScannerResult {
  try {
    const res = scanTelephone(page, context);
    return {
      scannerKey: 'TELEPHONE',
      status: 'COMPLETED',
      findings: res.findings,
      metrics: {
        totalLinks: res.hasTelLink ? res.validLinksCount + res.findings.length : 0,
        validLinks: res.validLinksCount,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'TELEPHONE',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown scanner error',
    };
  }
}
