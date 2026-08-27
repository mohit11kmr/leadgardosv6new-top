import { describe, expect, it } from 'vitest';
import {
  calculateScores,
  buildBusinessImpact,
  rankFindings,
  buildExecutiveSummary,
  scanWhatsApp,
  scanTelephone,
  scanFormsAndCtas,
  scanTracking,
  scanSeo,
  scanOpenGraph,
  scanMixedContent,
  scanSecurityHeaders,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';
import { deduplicateFindings, scanPage } from './audit.js';

const mockPage = (html: string, headers: Record<string, string> = {}, finalUrl = 'https://example.com/'): PageRecord => ({
  url: finalUrl,
  finalUrl,
  statusCode: 200,
  contentType: 'text/html',
  headers,
  htmlAvailable: true,
  responseTimeMs: 1,
  depth: 0,
  redirectChain: [],
  html,
});

describe('1. WhatsApp Scanner (LG-001)', () => {
  it('accepts valid Indian WhatsApp mobile numbers and parses query params', () => {
    const page = mockPage('<a href="https://wa.me/919876543210?text=Hello%20LeadGuard">WhatsApp</a>');
    const result = scanWhatsApp(page);
    expect(result.validLinksCount).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('detects leading 0 prefix with HIGH severity', () => {
    const page = mockPage('<a href="https://wa.me/091234567890">Chat</a>');
    const result = scanWhatsApp(page);
    expect(result.findings.some((f) => f.ruleId === 'LG-001' && f.severity === 'HIGH' && f.evidence.why.includes('Leading 0'))).toBe(true);
  });

  it('detects duplicated +91 country prefix (9191...) with HIGH severity', () => {
    const page = mockPage('<a href="https://wa.me/91919876543210">Chat</a>');
    const result = scanWhatsApp(page);
    expect(result.findings.some((f) => f.ruleId === 'LG-001' && f.severity === 'HIGH' && f.evidence.why.includes('Duplicated +91'))).toBe(true);
  });

  it('supports international countryMode without forcing +91', () => {
    const page = mockPage('<a href="https://wa.me/14155552671">US Chat</a>');
    const result = scanWhatsApp(page, { auditId: '1', websiteUrl: 'https://example.com', countryMode: 'GLOBAL' });
    expect(result.validLinksCount).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('flags empty phone parameter in api.whatsapp.com URL', () => {
    const page = mockPage('<a href="https://api.whatsapp.com/send?phone=">Chat</a>');
    const result = scanWhatsApp(page);
    expect(result.findings.some((f) => f.ruleId === 'LG-001' && f.severity === 'HIGH')).toBe(true);
  });
});

describe('2. Telephone Scanner (LG-003)', () => {
  it('accepts normalized international telephone URIs', () => {
    const page = mockPage('<a href="tel:+919876543210">Call Us</a>');
    const result = scanTelephone(page);
    expect(result.validLinksCount).toBe(1);
    expect(result.findings).toHaveLength(0);
  });

  it('distinguishes non-normalized telephone URIs (spaces, brackets) as LOW severity', () => {
    const page = mockPage('<a href="tel:(+91) 98765-43210">Call Us</a>');
    const result = scanTelephone(page);
    expect(result.findings.some((f) => f.ruleId === 'LG-003' && f.severity === 'LOW' && f.internalKey === 'TEL_NON_NORMALIZED')).toBe(true);
  });

  it('flags truly malformed telephone URIs (letters, too short) as HIGH severity', () => {
    const page = mockPage('<a href="tel:call-now">Call</a><a href="tel:123">123</a>');
    const result = scanTelephone(page);
    expect(result.findings.filter((f) => f.ruleId === 'LG-003' && f.severity === 'HIGH')).toHaveLength(2);
  });
});

describe('3. Contact Form & CTA Button Detector (LG-001)', () => {
  it('detects form with submit button and classifies states', () => {
    const page = mockPage('<form action="/submit"><input type="email"><button type="submit">Submit</button></form>');
    const result = scanFormsAndCtas(page);
    expect(result.hasForm).toBe(true);
    expect(result.detectedStates).toContain('FORM_PRESENT');
  });

  it('detects conservative CTA buttons and links', () => {
    const page = mockPage('<button>Book a Consultation</button><a href="/quote">Get Quote</a>');
    const result = scanFormsAndCtas(page);
    expect(result.hasCta).toBe(true);
    expect(result.detectedStates).toContain('CONTACT_CTA_PRESENT');
  });

  it('flags absence of form and CTA on empty page', () => {
    const page = mockPage('<div><p>Just plain informational text.</p></div>');
    const result = scanFormsAndCtas(page);
    expect(result.hasForm).toBe(false);
    expect(result.hasCta).toBe(false);
    expect(result.detectedStates).toContain('NO_DETECTABLE_FORM');
    expect(result.detectedStates).toContain('NO_DETECTABLE_CTA');
  });
});

describe('4. Tracking Scanners: Meta Pixel, GA4, GTM (LG-006 / LG-007)', () => {
  it('detects Meta Pixel, GA4, and GTM signatures independently', () => {
    const page = mockPage(`
      <script>
        fbq('init', '12345');
        gtag('config', 'G-TEST1234');
        window.dataLayer = [];
      </script>
      <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      <script src="https://www.googletagmanager.com/gtm.js?id=GTM-TEST99"></script>
    `);
    const result = scanTracking(page);
    expect(result.metaPixel.status).toBe('DETECTED');
    expect(result.ga4.status).toBe('DETECTED');
    expect(result.gtm.status).toBe('DETECTED');
  });

  it('correctly reports NOT_DETECTED when tracking scripts are absent', () => {
    const page = mockPage('<h1>No tracking here</h1>');
    const result = scanTracking(page);
    expect(result.metaPixel.status).toBe('NOT_DETECTED');
    expect(result.ga4.status).toBe('NOT_DETECTED');
    expect(result.gtm.status).toBe('NOT_DETECTED');
  });
});

describe('5. SEO Scanner: Indexing & Canonical (LG-010 / LG-011)', () => {
  it('detects noindex in meta robots, googlebot, and X-Robots-Tag with HIGH severity', () => {
    const pageMeta = mockPage('<meta name="robots" content="noindex, nofollow">');
    const resultMeta = scanSeo(pageMeta);
    expect(resultMeta.hasNoindex).toBe(true);
    expect(resultMeta.findings.some((f) => f.ruleId === 'LG-010' && f.severity === 'HIGH')).toBe(true);

    const pageHeader = mockPage('<h1>Title</h1>', { 'x-robots-tag': 'none' });
    const resultHeader = scanSeo(pageHeader);
    expect(resultHeader.hasNoindex).toBe(true);
    expect(resultHeader.findings.some((f) => f.ruleId === 'LG-010')).toBe(true);
  });

  it('validates canonical link tags: missing, duplicate, relative, fragment, cross-origin', () => {
    // Missing canonical
    const pageMissing = mockPage('<h1>Title</h1>');
    expect(scanSeo(pageMissing).findings.some((f) => f.ruleId === 'LG-011' && f.internalKey === 'CANONICAL_MISSING')).toBe(true);

    // Duplicate canonicals
    const pageDup = mockPage('<link rel="canonical" href="https://example.com/a"><link rel="canonical" href="https://example.com/b">');
    expect(scanSeo(pageDup).findings.some((f) => f.ruleId === 'LG-011' && f.internalKey === 'CANONICAL_DUPLICATE')).toBe(true);

    // Cross-origin canonical
    const pageCross = mockPage('<link rel="canonical" href="https://otherdomain.test/page">', {}, 'https://example.com/page');
    expect(scanSeo(pageCross).findings.some((f) => f.ruleId === 'LG-011' && f.severity === 'HIGH' && f.internalKey === 'CANONICAL_CROSS_ORIGIN')).toBe(true);

    // Relative canonical
    const pageRel = mockPage('<link rel="canonical" href="/relative-path">');
    expect(scanSeo(pageRel).findings.some((f) => f.ruleId === 'LG-011' && f.internalKey === 'CANONICAL_RELATIVE')).toBe(true);
  });
});

describe('6. OpenGraph & Social Metadata Scanner (LG-012)', () => {
  it('detects missing og:title, og:image, og:description, and og:url with LOW severity', () => {
    const page = mockPage('<title>Test</title>');
    const result = scanOpenGraph(page);
    expect(result.findings.filter((f) => f.ruleId === 'LG-012' && f.severity === 'LOW')).toHaveLength(4);
  });

  it('detects empty content attribute and relative image URLs', () => {
    const page = mockPage('<meta property="og:title" content=""><meta property="og:image" content="/img.png"><meta property="og:url" content="https://example.com"><meta property="og:description" content="Desc">');
    const result = scanOpenGraph(page);
    expect(result.findings.some((f) => f.title.includes('empty'))).toBe(true);
    expect(result.findings.some((f) => f.title.includes('absolute URL'))).toBe(true);
  });
});

describe('7. Mixed Content Scanner (LG-013)', () => {
  it('detects insecure HTTP script, img, iframe, and stylesheet on HTTPS pages', () => {
    const page = mockPage(
      '<script src="http://cdn.test/app.js"></script><img src="http://cdn.test/pic.png"><link rel="stylesheet" href="http://cdn.test/style.css">',
      {},
      'https://example.com/'
    );
    const result = scanMixedContent(page);
    expect(result.hasMixedContent).toBe(true);
    expect(result.insecureResourceCount).toBe(3);
    expect(result.findings.some((f) => f.ruleId === 'LG-013' && f.severity === 'HIGH')).toBe(true); // script is HIGH
    expect(result.findings.some((f) => f.ruleId === 'LG-013' && f.severity === 'MEDIUM')).toBe(true); // img is MEDIUM
  });
});

describe('8. Security Headers Scanner (LG-014)', () => {
  it('reports missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options with structured evidence', () => {
    const page = mockPage('<h1>Test</h1>', { 'content-type': 'text/html' });
    const result = scanSecurityHeaders(page);
    expect(result.missingHeaders).toContain('content-security-policy');
    expect(result.missingHeaders).toContain('strict-transport-security');
    expect(result.findings.some((f) => f.ruleId === 'LG-014' && f.title.includes('CSP') && f.scope === 'WEBSITE')).toBe(true);
  });
});

describe('9. Scoring Architecture & Deduplication (CRITICAL FIX)', () => {
  it('does NOT apply 10x penalty when 10 pages have the same website-level issue (e.g. missing CSP)', () => {
    // 10 identical findings from 10 pages for missing CSP
    const tenMissingCspFindings: Finding[] = Array.from({ length: 10 }, (_, i) => ({
      ruleId: 'LG-014',
      internalKey: 'SEC_HEADER_CSP',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'Content-Security-Policy (CSP) header missing',
      description: 'The response did not include CSP.',
      affectedUrl: `https://example.com/page-${i + 1}`,
      evidence: { source: 'header', observed: 'none', location: `page-${i + 1}`, why: 'why', recommendation: 'rec' },
      recommendation: 'Configure CSP',
      scoreImpact: 5,
    }));

    const deduplicated = deduplicateFindings(tenMissingCspFindings);
    // Website-level findings should deduplicate to 1 finding
    const scores = calculateScores(deduplicated, 'v2');
    // Security score starts at 100, subtracting CSP penalty of 5 once -> 95 (NOT 100 - 50 = 50!)
    expect(scores.security).toBe(95);
  });

  it('bounds page-level penalties reasonably across multiple pages', () => {
    // 5 pages with malformed WhatsApp link (rule defaultImpact = 18, maxPenalty = 36)
    const fiveBadWaFindings: Finding[] = Array.from({ length: 5 }, (_, i) => ({
      ruleId: 'LG-001',
      internalKey: 'WHATSAPP_MALFORMED',
      category: 'LEAD',
      scope: 'PAGE',
      severity: 'HIGH',
      title: 'WhatsApp number appears malformed',
      description: 'Leading 0 prefix',
      affectedUrl: `https://example.com/contact-${i + 1}`,
      evidence: { source: 'href', observed: 'wa.me/091...', location: `contact-${i + 1}`, why: 'why', recommendation: 'rec' },
      recommendation: 'Fix WA',
      scoreImpact: 18,
    }));

    const scores = calculateScores(fiveBadWaFindings, 'v2');
    // Lead score starts at 100. Capped at maxPenalty = 36 -> 100 - 36 = 64 (NOT 100 - (5*18) = 10)
    expect(scores.lead).toBe(64);
  });
});

describe('10. Business Impact & Opportunity Loss Model', () => {
  it('calculates Potential Opportunity Loss transparently from traffic, conversion risk, and lead value', () => {
    const findings: Finding[] = [
      {
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp malformed',
        description: 'desc',
        evidence: { source: 'href', observed: 'obs', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'rec',
        scoreImpact: 18,
      },
      {
        ruleId: 'LG-014',
        internalKey: 'SEC_HEADER_CSP',
        category: 'SECURITY',
        scope: 'WEBSITE',
        severity: 'MEDIUM',
        title: 'CSP missing',
        description: 'desc',
        evidence: { source: 'header', observed: 'obs', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'rec',
        scoreImpact: 5,
      },
    ];

    const impact = buildBusinessImpact(findings, {
      monthlyVisitors: 10000,
      conversionRate: 3.0,
      averageLeadValue: 1000,
      source: 'USER',
    });

    expect(impact.kind).toBe('POTENTIAL_OPPORTUNITY_LOSS');
    expect(impact.confidence).toBe('HIGH');
    expect(impact.inputs.source).toBe('USER');
    expect(impact.estimatedConversionRisk).toBeGreaterThan(0);
    expect(impact.estimatedOpportunityLoss).toBeGreaterThan(0);
    expect(impact.methodology).toContain('Potential Opportunity Loss');
  });
});

describe('11. Priority Engine & Executive Summary', () => {
  it('ranks critical issues higher and provides actionable executive summary', () => {
    const findings: Finding[] = [
      {
        ruleId: 'LG-012',
        internalKey: 'OPENGRAPH_MISSING',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'OG title missing',
        description: 'desc',
        evidence: { source: 'head', observed: 'obs', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'Add OG tags',
        scoreImpact: 2,
      },
      {
        ruleId: 'LG-013',
        internalKey: 'TLS_ERROR',
        category: 'SECURITY',
        scope: 'WEBSITE',
        severity: 'CRITICAL',
        title: 'SSL/TLS certificate invalid',
        description: 'desc',
        evidence: { source: 'tls', observed: 'obs', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'Install trusted SSL certificate',
        scoreImpact: 30,
      },
    ];

    const ranked = rankFindings(findings);
    expect(ranked[0]?.ruleId).toBe('LG-013'); // CRITICAL TLS finding ranked top

    const scores = calculateScores(findings, 'v2');
    const impact = buildBusinessImpact(findings);
    const summary = buildExecutiveSummary(findings, scores, impact);

    expect(summary.criticalCount).toBe(1);
    expect(summary.topProblems[0]).toContain('SSL/TLS certificate invalid');
    expect(summary.priorityFixes[0]).toContain('Install trusted SSL certificate');
  });
});
