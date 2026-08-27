import type { Finding, PageRecord, ScannerContext } from '../types.js';

export interface SeoScanResult {
  findings: Finding[];
  hasNoindex: boolean;
  canonicalUrl?: string;
  hasValidCanonical: boolean;
}

function extractMeta(html: string, name: string): string {
  const match = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`, 'i'));
  return match?.[1]?.trim() ?? '';
}

export function scanSeo(page: PageRecord, _context?: ScannerContext): SeoScanResult {
  const findings: Finding[] = [];
  const html = page.html;

  // --- 1. LG-010: Indexing & Robots Directives ---
  const robotsMeta = extractMeta(html, 'robots').toLowerCase();
  const googlebotMeta = extractMeta(html, 'googlebot').toLowerCase();
  const xRobotsHeader = (page.headers['x-robots-tag'] ?? '').toLowerCase();

  const combinedRobots = `${robotsMeta} ${googlebotMeta} ${xRobotsHeader}`.trim();
  const hasNoindexDirective = /\b(?:noindex|none)\b/i.test(combinedRobots);

  if (hasNoindexDirective) {
    const matchedSource = xRobotsHeader && /\b(?:noindex|none)\b/i.test(xRobotsHeader)
      ? `X-Robots-Tag: ${page.headers['x-robots-tag']}`
      : googlebotMeta && /\b(?:noindex|none)\b/i.test(googlebotMeta)
        ? `<meta name="googlebot" content="${googlebotMeta}">`
        : `<meta name="robots" content="${robotsMeta}">`;

    findings.push({
      ruleId: 'LG-010',
      internalKey: 'NOINDEX_PAGE',
      category: 'SEO',
      scope: 'PAGE',
      severity: 'HIGH',
      title: 'Page instructs search engines not to index it',
      description: 'A robots directive contains "noindex" or "none", preventing this page from appearing in search results.',
      affectedUrl: page.url,
      evidence: {
        source: 'meta/header',
        observed: matchedSource,
        location: page.url,
        why: 'The noindex or none directive explicitly prohibits search engine crawlers from indexing this page.',
        recommendation: 'Remove noindex unless this is an intentional private or thank-you page.',
        metadata: { robotsMeta, googlebotMeta, xRobotsHeader },
      },
      recommendation: 'Remove noindex directive from pages intended for organic discovery.',
      scoreImpact: 18,
      businessImpact: 'The page cannot rank on Google or capture organic inbound search traffic.',
    });
  }

  // --- 2. LG-011: Canonical Link Tag Validation ---
  const canonicalMatches = [...html.matchAll(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/gi)]
    .concat([...html.matchAll(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/gi)]);

  const canonicalHrefs = canonicalMatches.map((m) => m[1]?.trim() ?? '').filter(Boolean);

  let canonicalUrl: string | undefined;
  let hasValidCanonical = false;

  if (canonicalHrefs.length === 0) {
    findings.push({
      ruleId: 'LG-011',
      internalKey: 'CANONICAL_MISSING',
      category: 'SEO',
      scope: 'PAGE',
      severity: 'MEDIUM',
      title: 'Canonical link tag is missing',
      description: 'No rel="canonical" link element was found on this page.',
      affectedUrl: page.url,
      evidence: {
        source: 'head',
        observed: 'No <link rel="canonical"> element found',
        location: page.url,
        why: 'Missing canonical URL can lead to duplicate content indexing and diluted search ranking signals.',
        recommendation: `Add <link rel="canonical" href="${page.finalUrl}"> to the <head>.`,
      },
      recommendation: 'Add a canonical link declaring the preferred authoritative URL for this page.',
      scoreImpact: 6,
      businessImpact: 'Search engines may split ranking authority across duplicate or parameter URLs.',
    });
  } else if (canonicalHrefs.length > 1) {
    findings.push({
      ruleId: 'LG-011',
      internalKey: 'CANONICAL_DUPLICATE',
      category: 'SEO',
      scope: 'PAGE',
      severity: 'MEDIUM',
      title: 'Duplicate canonical link tags detected',
      description: `Multiple (${canonicalHrefs.length}) canonical link tags were declared on the same page.`,
      affectedUrl: page.url,
      evidence: {
        source: 'head',
        observed: canonicalHrefs.join(' | '),
        location: page.url,
        why: 'Multiple conflicting canonical tags cause search engines to ignore all canonical declarations.',
        recommendation: 'Keep only one authoritative <link rel="canonical"> element.',
        metadata: { canonicals: canonicalHrefs },
      },
      recommendation: 'Keep only one canonical link declaration per page.',
      scoreImpact: 6,
      businessImpact: 'Conflicting canonical tags will cause search engines to disregard the canonical directive.',
    });
  } else {
    const rawCanonical = canonicalHrefs[0]!;
    canonicalUrl = rawCanonical;

    // Check if valid URL
    try {
      // Check if relative URL
      if (!/^https?:\/\//i.test(rawCanonical)) {
        findings.push({
          ruleId: 'LG-011',
          internalKey: 'CANONICAL_RELATIVE',
          category: 'SEO',
          scope: 'PAGE',
          severity: 'LOW',
          title: 'Canonical URL is relative instead of absolute',
          description: `The canonical URL "${rawCanonical}" is relative. RFC and search engine guidelines strongly recommend absolute URLs.`,
          affectedUrl: page.url,
          evidence: {
            source: 'link[rel=canonical]',
            observed: rawCanonical,
            location: page.url,
            why: 'Relative canonical URLs can be misinterpreted if pages are accessed via unexpected paths.',
            recommendation: `Use an absolute canonical URL (e.g. ${new URL(rawCanonical, page.finalUrl).toString()}).`,
          },
          recommendation: 'Use an absolute URL for the canonical declaration.',
          scoreImpact: 3,
        });
      }

      const parsedCanonical = new URL(rawCanonical, page.finalUrl);

      // Check for fragment / hash (#) in canonical
      if (parsedCanonical.hash) {
        findings.push({
          ruleId: 'LG-011',
          internalKey: 'CANONICAL_FRAGMENT',
          category: 'SEO',
          scope: 'PAGE',
          severity: 'LOW',
          title: 'Canonical URL contains a URL fragment',
          description: `The canonical URL "${rawCanonical}" includes a fragment identifier (#), which is ignored by search engines.`,
          affectedUrl: page.url,
          evidence: {
            source: 'link[rel=canonical]',
            observed: rawCanonical,
            location: page.url,
            why: 'URL fragments are client-side only and should not be included in canonical URLs.',
            recommendation: 'Remove the hash/fragment portion from the canonical URL.',
          },
          recommendation: 'Remove fragments (#) from the canonical URL.',
          scoreImpact: 3,
        });
      }

      // Check cross-origin canonical
      const pageOrigin = new URL(page.finalUrl).origin;
      if (parsedCanonical.origin !== pageOrigin) {
        findings.push({
          ruleId: 'LG-011',
          internalKey: 'CANONICAL_CROSS_ORIGIN',
          category: 'SEO',
          scope: 'PAGE',
          severity: 'HIGH',
          title: 'Canonical URL points to a different domain origin',
          description: `The canonical target "${parsedCanonical.origin}" differs from the page origin "${pageOrigin}".`,
          affectedUrl: page.url,
          evidence: {
            source: 'link[rel=canonical]',
            observed: rawCanonical,
            location: page.url,
            why: 'Cross-origin canonical passes ranking authority away to an external domain.',
            recommendation: 'Ensure cross-origin canonical is intentional; otherwise set canonical to the same origin.',
            metadata: { pageOrigin, canonicalOrigin: parsedCanonical.origin },
          },
          recommendation: 'Review cross-domain canonical target to prevent transferring indexing credit elsewhere.',
          scoreImpact: 10,
          businessImpact: 'Search engine indexing authority is transferred to another domain.',
        });
      } else {
        hasValidCanonical = true;
      }
    } catch {
      findings.push({
        ruleId: 'LG-011',
        internalKey: 'CANONICAL_MALFORMED',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'Canonical URL is malformed',
        description: `The canonical href value "${rawCanonical}" is not a valid URL.`,
        affectedUrl: page.url,
        evidence: {
          source: 'link[rel=canonical]',
          observed: rawCanonical,
          location: page.url,
          why: 'The href attribute cannot be parsed as a valid URI.',
          recommendation: 'Specify a valid absolute canonical URL.',
        },
        recommendation: 'Provide a syntactically valid absolute URL for the canonical tag.',
        scoreImpact: 8,
      });
    }
  }

  return {
    findings,
    hasNoindex: hasNoindexDirective,
    canonicalUrl,
    hasValidCanonical,
  };
}
