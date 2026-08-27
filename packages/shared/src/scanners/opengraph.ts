import type { Finding, PageRecord, ScannerContext } from '../types.js';

export interface OpenGraphScanResult {
  findings: Finding[];
  hasOgTitle: boolean;
  hasOgImage: boolean;
  hasOgDescription: boolean;
  hasOgUrl: boolean;
  hasTwitterCard: boolean;
}

export function scanOpenGraph(page: PageRecord, _context?: ScannerContext): OpenGraphScanResult {
  const findings: Finding[] = [];
  const html = page.html;

  const requiredOgTags = ['og:title', 'og:description', 'og:image', 'og:url'] as const;

  let hasOgTitle = false;
  let hasOgImage = false;
  let hasOgDescription = false;
  let hasOgUrl = false;
  let hasTwitterCard = false;

  for (const property of requiredOgTags) {
    // Find all meta tags with property="og:..." or name="og:..."
    const matches = [
      ...html.matchAll(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'gi')),
      ...html.matchAll(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property}["']`, 'gi')),
      ...html.matchAll(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']*)["']`, 'gi')),
    ];

    if (matches.length === 0) {
      findings.push({
        ruleId: 'LG-012',
        internalKey: 'OPENGRAPH_MISSING',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: `OpenGraph tag missing: ${property}`,
        description: `The meta tag for "${property}" was not found in the page header.`,
        affectedUrl: page.url,
        evidence: {
          source: 'head',
          observed: `No <meta property="${property}"> found`,
          location: page.url,
          why: 'Social platforms like WhatsApp, Facebook, and LinkedIn use OpenGraph tags to generate rich link previews.',
          recommendation: `Add <meta property="${property}" content="..."> to the page <head>.`,
        },
        recommendation: `Configure ${property} for rich social and messaging previews.`,
        scoreImpact: 2,
        businessImpact: 'Links shared on WhatsApp or social media appear as plain URLs without rich titles or images.',
      });
      continue;
    }

    const value = matches[0]![1]?.trim() ?? '';

    if (!value) {
      findings.push({
        ruleId: 'LG-012',
        internalKey: 'OPENGRAPH_MALFORMED',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: `OpenGraph tag is empty: ${property}`,
        description: `The meta tag for "${property}" was present but has an empty content attribute.`,
        affectedUrl: page.url,
        evidence: {
          source: 'head',
          observed: `<meta property="${property}" content="">`,
          location: page.url,
          why: 'Empty content attribute cannot be used by social preview scrapers.',
          recommendation: `Provide a descriptive value for ${property}.`,
        },
        recommendation: `Provide a non-empty value for ${property}.`,
        scoreImpact: 2,
      });
      continue;
    }

    // Validate URL properties (og:image, og:url)
    if (property === 'og:image' || property === 'og:url') {
      if (!/^https?:\/\//i.test(value)) {
        findings.push({
          ruleId: 'LG-012',
          internalKey: 'OPENGRAPH_MALFORMED',
          category: 'SEO',
          scope: 'PAGE',
          severity: 'LOW',
          title: `OpenGraph ${property} must be an absolute URL`,
          description: `The ${property} value "${value}" is not an absolute URL.`,
          affectedUrl: page.url,
          evidence: {
            source: 'head',
            observed: `<meta property="${property}" content="${value}">`,
            location: page.url,
            why: 'Social platforms require absolute URLs for preview images and canonical shared URLs.',
            recommendation: `Specify a full absolute URL for ${property} (e.g., https://...).`,
          },
          recommendation: `Use an absolute HTTPS URL for ${property}.`,
          scoreImpact: 2,
        });
      }
    }

    if (property === 'og:title') hasOgTitle = true;
    if (property === 'og:image') hasOgImage = true;
    if (property === 'og:description') hasOgDescription = true;
    if (property === 'og:url') hasOgUrl = true;
  }

  // Check Twitter Card
  const twitterCardMatch = html.match(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']*)["']/i);
  if (twitterCardMatch?.[1]) {
    hasTwitterCard = true;
  }

  return {
    findings,
    hasOgTitle,
    hasOgImage,
    hasOgDescription,
    hasOgUrl,
    hasTwitterCard,
  };
}
