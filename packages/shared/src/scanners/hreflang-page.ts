import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';
import { scanHreflang } from './hreflang.js';

export function runHreflangScanner(page: PageRecord, _context?: ScannerContext): ScannerResult {
  try {
    const res = scanHreflang(page);
    const findings: Finding[] = [];

    if (res.malformedLangCodes.length > 0) {
      findings.push({
        ruleId: 'LG-041',
        internalKey: 'HREFLANG_MALFORMED',
        normalizedIssueKey: 'HREFLANG_MALFORMED',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Malformed hreflang language code',
        description: `The following hreflang value(s) don't match a valid language[-REGION] code or "x-default": ${res.malformedLangCodes.join(', ')}`,
        affectedUrl: page.url,
        evidence: {
          source: 'hreflang',
          observed: res.malformedLangCodes.join(', '),
          location: page.url,
          why: 'Search engines ignore hreflang annotations with unrecognized language codes, silently dropping the international targeting this page intended.',
          recommendation: 'Use a valid BCP47 language code (e.g. "en", "en-US") or "x-default".',
        },
        recommendation: 'Correct the malformed hreflang language code(s).',
        scoreImpact: 1,
      });
    }

    if (res.duplicateLangConflicts.length > 0) {
      findings.push({
        ruleId: 'LG-041',
        internalKey: 'HREFLANG_CONFLICTING',
        normalizedIssueKey: 'HREFLANG_CONFLICTING',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'MEDIUM',
        title: 'Conflicting hreflang declarations for the same language',
        description: res.duplicateLangConflicts
          .map((c) => `"${c.lang}" points to ${c.hrefs.length} different URLs: ${c.hrefs.join(', ')}`)
          .join('; '),
        affectedUrl: page.url,
        evidence: {
          source: 'hreflang',
          observed: JSON.stringify(res.duplicateLangConflicts),
          location: page.url,
          why: 'Search engines cannot honor two different hreflang targets declared for the same language — the annotation becomes unreliable.',
          recommendation: 'Declare exactly one href per hreflang language value.',
        },
        recommendation: 'Remove the conflicting duplicate hreflang declaration(s).',
        scoreImpact: 2,
      });
    }

    if (res.selfReferenceConflict) {
      findings.push({
        ruleId: 'LG-041',
        internalKey: 'HREFLANG_CANONICAL_CONFLICT',
        normalizedIssueKey: 'HREFLANG_CANONICAL_CONFLICT',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'MEDIUM',
        title: 'hreflang self-reference conflicts with the page canonical',
        description: `This page declares an hreflang entry pointing at itself, but its canonical tag points to ${res.canonicalUrl}, a different URL — a direct contradiction about which URL is authoritative.`,
        affectedUrl: page.url,
        evidence: {
          source: 'hreflang',
          observed: `canonical=${res.canonicalUrl}`,
          location: page.url,
          why: 'A page telling search engines "I am the target of my own hreflang entry" while also telling them "the real page is elsewhere" is a direct, page-local contradiction search engines may resolve unpredictably.',
          recommendation: 'Ensure the hreflang self-reference and the canonical tag agree on the same URL.',
        },
        recommendation: 'Align the hreflang self-reference with the canonical URL.',
        scoreImpact: 2,
      });
    }

    return {
      scannerKey: 'HREFLANG',
      status: 'COMPLETED',
      findings,
      metrics: { declarationCount: res.declarations.length },
    };
  } catch (error) {
    return {
      scannerKey: 'HREFLANG',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown hreflang scanner error',
    };
  }
}
