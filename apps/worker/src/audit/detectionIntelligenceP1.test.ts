import { describe, it, expect } from 'vitest';
import { evaluateConsentFindings, evaluateHreflangReciprocity, evaluateDuplicateContentFindings } from './detectionIntelligenceP1.js';
import { aggregateWebsiteSignals } from './aggregation.js';
import { evaluateTrackingRuntime } from '@leadguard/shared';
import type { NetworkEvidenceEntry, PageRecord } from '@leadguard/shared';

function makePage(overrides: Partial<PageRecord>): PageRecord {
  return {
    url: 'https://shop.test/',
    finalUrl: 'https://shop.test/',
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    htmlAvailable: true,
    responseTimeMs: 100,
    depth: 0,
    redirectChain: [],
    html: '<html><body>plain page</body></html>',
    ...overrides,
  };
}

function ga4Entry(): NetworkEvidenceEntry {
  return {
    provider: 'GA4',
    requestUrl: 'www.google-analytics.com/g/collect',
    method: 'GET',
    timestampMs: Date.now(),
    pageUrl: 'https://shop.test/',
    resourceType: 'xhr',
    matchedSignature: 'www.google-analytics.com/g/collect',
    evidenceType: 'FIRED',
    confidence: 'HIGH',
    relevantQueryParams: {},
  };
}

describe('evaluateConsentFindings', () => {
  it('flags NO_CONSENT_MECHANISM_DETECTED when tracking is present and no CMP is found', () => {
    const pages = [makePage({ html: '<html><head><script>gtag("config","G-X");</script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    const findings = evaluateConsentFindings(pages, signals, undefined, 'https://shop.test');
    expect(findings.some((f) => f.internalKey === 'NO_CONSENT_MECHANISM_DETECTED')).toBe(true);
  });

  it('does not flag missing consent when there is no tracking at all', () => {
    const pages = [makePage({})];
    const signals = aggregateWebsiteSignals(pages);
    const findings = evaluateConsentFindings(pages, signals, undefined, 'https://shop.test');
    expect(findings.some((f) => f.internalKey === 'NO_CONSENT_MECHANISM_DETECTED')).toBe(false);
  });

  it('does not flag missing consent when a CMP is present', () => {
    const pages = [
      makePage({
        html: '<html><head><script src="https://cdn.cookielaw.org/x.js"></script><script>gtag("config","G-X");</script></head></html>',
      }),
    ];
    const signals = aggregateWebsiteSignals(pages);
    const findings = evaluateConsentFindings(pages, signals, undefined, 'https://shop.test');
    expect(findings.some((f) => f.internalKey === 'NO_CONSENT_MECHANISM_DETECTED')).toBe(false);
  });

  it('correlates: flags TRACKER_FIRED_BEFORE_CONSENT_GA4 when a CMP is present and GA4 fired at runtime', () => {
    const pages = [makePage({ html: '<html><head><script src="https://cdn.cookielaw.org/x.js"></script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    const trackingRuntime = evaluateTrackingRuntime([ga4Entry()], true);
    const findings = evaluateConsentFindings(pages, signals, trackingRuntime, 'https://shop.test');
    const finding = findings.find((f) => f.internalKey === 'TRACKER_FIRED_BEFORE_CONSENT_GA4');
    expect(finding).toBeDefined();
    expect(finding?.metadata?.confidence).toBe('OBSERVED');
  });

  it('does NOT correlate when the CMP is present but tracking runtime status is NOT_OBSERVED (nothing fired)', () => {
    const pages = [makePage({ html: '<html><head><script src="https://cdn.cookielaw.org/x.js"></script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    const trackingRuntime = evaluateTrackingRuntime([], true); // capture ran, nothing matched
    const findings = evaluateConsentFindings(pages, signals, trackingRuntime, 'https://shop.test');
    expect(findings.some((f) => f.internalKey?.startsWith('TRACKER_FIRED_BEFORE_CONSENT'))).toBe(false);
  });

  it('never turns UNKNOWN into a finding when trackingRuntime is unavailable (rescan disabled/failed)', () => {
    const pages = [makePage({ html: '<html><head><script src="https://cdn.cookielaw.org/x.js"></script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    const findings = evaluateConsentFindings(pages, signals, undefined, 'https://shop.test');
    expect(findings.some((f) => f.internalKey?.startsWith('TRACKER_FIRED_BEFORE_CONSENT'))).toBe(false);
  });
});

describe('evaluateHreflangReciprocity', () => {
  it('flags a missing reciprocal hreflang declaration between two crawled pages', () => {
    const pages = [
      makePage({
        url: 'https://shop.test/en/',
        finalUrl: 'https://shop.test/en/',
        html: '<link rel="alternate" hreflang="fr" href="https://shop.test/fr/" />',
      }),
      makePage({
        url: 'https://shop.test/fr/',
        finalUrl: 'https://shop.test/fr/',
        html: '<html><body>no hreflang back</body></html>',
      }),
    ];
    const findings = evaluateHreflangReciprocity(pages, 'https://shop.test');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.internalKey).toBe('HREFLANG_MISSING_RECIPROCAL');
  });

  it('does not flag when both pages declare hreflang back to each other', () => {
    const pages = [
      makePage({
        url: 'https://shop.test/en/',
        finalUrl: 'https://shop.test/en/',
        html: '<link rel="alternate" hreflang="fr" href="https://shop.test/fr/" />',
      }),
      makePage({
        url: 'https://shop.test/fr/',
        finalUrl: 'https://shop.test/fr/',
        html: '<link rel="alternate" hreflang="en" href="https://shop.test/en/" />',
      }),
    ];
    expect(evaluateHreflangReciprocity(pages, 'https://shop.test')).toEqual([]);
  });

  it('does not flag a target that was not crawled (unknown, not a failure)', () => {
    const pages = [
      makePage({
        url: 'https://shop.test/en/',
        finalUrl: 'https://shop.test/en/',
        html: '<link rel="alternate" hreflang="de" href="https://shop.test/de/" />', // /de/ never crawled
      }),
    ];
    expect(evaluateHreflangReciprocity(pages, 'https://shop.test')).toEqual([]);
  });

  it('does not flag when there is no hreflang usage at all', () => {
    const pages = [makePage({})];
    expect(evaluateHreflangReciprocity(pages, 'https://shop.test')).toEqual([]);
  });
});

describe('evaluateDuplicateContentFindings', () => {
  it('produces one Finding per duplicate-content group', () => {
    const html = `<html><body>${'Repeated content block. '.repeat(20)}</body></html>`;
    const pages = [
      makePage({ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', html }),
      makePage({ url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', html }),
    ];
    const findings = evaluateDuplicateContentFindings(pages, 'https://shop.test');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.internalKey).toBe('DUPLICATE_CONTENT');
    expect(findings[0]?.category).toBe('SEO');
  });

  it('produces no findings when content is unique', () => {
    const pages = [
      makePage({ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', html: '<html><body>' + 'a'.repeat(250) + '</body></html>' }),
      makePage({ url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', html: '<html><body>' + 'b'.repeat(250) + '</body></html>' }),
    ];
    expect(evaluateDuplicateContentFindings(pages, 'https://shop.test')).toEqual([]);
  });
});
