import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';
import { scanStructuredData } from './structured-data.js';

export function runStructuredDataScanner(page: PageRecord, _context?: ScannerContext): ScannerResult {
  try {
    const res = scanStructuredData(page);
    const findings: Finding[] = [];

    if (res.hasMalformedJsonLd) {
      const malformed = res.jsonLdBlocks.filter((b) => !b.valid);
      findings.push({
        ruleId: 'LG-040',
        internalKey: 'STRUCTURED_DATA_MALFORMED',
        normalizedIssueKey: 'STRUCTURED_DATA_MALFORMED',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'MEDIUM',
        title: 'Malformed JSON-LD structured data',
        description: `${malformed.length} JSON-LD block(s) on this page contain invalid JSON and cannot be parsed by search engines: ${malformed.map((b) => b.parseError).join('; ')}`,
        affectedUrl: page.url,
        evidence: {
          source: 'json_ld',
          observed: malformed.map((b) => b.parseError ?? 'Invalid JSON').join('; '),
          location: page.url,
          why: 'Malformed structured data is silently ignored by search engines, forfeiting any rich-result eligibility it was meant to enable.',
          recommendation: 'Validate each JSON-LD block as JSON and fix the syntax error(s).',
        },
        recommendation: 'Fix the malformed JSON-LD block(s) so they parse as valid JSON.',
        scoreImpact: 3,
      });
    }

    if (res.duplicateTypes.length > 0) {
      findings.push({
        ruleId: 'LG-040',
        internalKey: 'STRUCTURED_DATA_DUPLICATE_TYPE',
        normalizedIssueKey: 'STRUCTURED_DATA_DUPLICATE_TYPE',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Duplicate structured-data type on the same page',
        description: `The type(s) ${res.duplicateTypes.join(', ')} appear in more than one JSON-LD block on this page.`,
        affectedUrl: page.url,
        evidence: {
          source: 'json_ld',
          observed: `Duplicate @type: ${res.duplicateTypes.join(', ')}`,
          location: page.url,
          why: 'Multiple blocks declaring the same schema type on one page can produce ambiguous or conflicting signals to search engines.',
          recommendation: 'Consolidate into a single JSON-LD block per type, or use @graph to combine related entities intentionally.',
        },
        recommendation: 'Consolidate duplicate structured-data blocks for the same type.',
        scoreImpact: 1,
      });
    }

    return {
      scannerKey: 'STRUCTURED_DATA',
      status: 'COMPLETED',
      findings,
      metrics: {
        jsonLdBlockCount: res.jsonLdBlocks.length,
        hasValidJsonLd: res.hasValidJsonLd,
        hasMicrodata: res.hasMicrodata,
        hasRdfa: res.hasRdfa,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'STRUCTURED_DATA',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown structured-data scanner error',
    };
  }
}
