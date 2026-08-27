import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';

export interface MixedContentScanResult {
  findings: Finding[];
  hasMixedContent: boolean;
  insecureResourceCount: number;
}

export function scanMixedContent(page: PageRecord, _context?: ScannerContext): MixedContentScanResult {
  const findings: Finding[] = [];
  const html = page.html;

  // Only active for HTTPS pages
  if (!page.finalUrl.startsWith('https://')) {
    return { findings, hasMixedContent: false, insecureResourceCount: 0 };
  }

  // Detect insecure resource loads: script, img, iframe, link (stylesheet), video, audio, source
  const patterns = [
    { tag: 'script', regex: /<script[^>]+src=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'img', regex: /<img[^>]+src=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'iframe', regex: /<iframe[^>]+src=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'stylesheet', regex: /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'video', regex: /<video[^>]+src=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'audio', regex: /<audio[^>]+src=["'](http:\/\/[^"']+)["']/gi },
    { tag: 'source', regex: /<source[^>]+src=["'](http:\/\/[^"']+)["']/gi },
  ];

  const seenInsecureUrls = new Set<string>();

  for (const { tag, regex } of patterns) {
    for (const match of html.matchAll(regex)) {
      const insecureUrl = match[1]?.trim() ?? '';
      if (!insecureUrl || seenInsecureUrls.has(insecureUrl)) continue;
      seenInsecureUrls.add(insecureUrl);

      const isActive = tag === 'script' || tag === 'iframe';
      const normalizedIssueKey = isActive ? 'MIXED_CONTENT_ACTIVE' : 'MIXED_CONTENT_PASSIVE';

      findings.push({
        ruleId: 'LG-013',
        internalKey: normalizedIssueKey,
        normalizedIssueKey,
        category: 'SECURITY',
        scope: 'PAGE',
        severity: isActive ? 'HIGH' : 'MEDIUM',
        title: `Mixed content detected: ${tag} loaded over insecure HTTP`,
        description: `The HTTPS page requests an active or passive resource (${tag}) over unencrypted HTTP: "${insecureUrl.slice(0, 100)}".`,
        affectedUrl: page.url,
        evidence: {
          source: `<${tag}> tag`,
          observed: insecureUrl.slice(0, 150),
          location: page.url,
          why: 'Modern browsers block or flag mixed-content resources loaded over HTTP on secure HTTPS websites.',
          recommendation: `Upgrade the resource URL "${insecureUrl}" to HTTPS or host the asset locally.`,
          metadata: { resourceTag: tag, resourceUrl: insecureUrl },
        },
        recommendation: `Serve all embedded ${tag} assets securely over HTTPS.`,
        scoreImpact: isActive ? 15 : 5,
        businessImpact: 'Browsers may block scripts/styles or display "Not Secure" warning indicators to visitors.',
      });
    }
  }

  return {
    findings,
    hasMixedContent: findings.length > 0,
    insecureResourceCount: findings.length,
  };
}

export function runMixedContentScanner(page: PageRecord, context?: ScannerContext): ScannerResult {
  try {
    const res = scanMixedContent(page, context);
    return {
      scannerKey: 'MIXED_CONTENT',
      status: 'COMPLETED',
      findings: res.findings,
      metrics: {
        hasMixedContent: res.hasMixedContent,
        insecureResourceCount: res.insecureResourceCount,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'MIXED_CONTENT',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown scanner error',
    };
  }
}
