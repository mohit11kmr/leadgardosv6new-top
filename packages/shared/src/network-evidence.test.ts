import { describe, it, expect } from 'vitest';
import {
  matchTrackingRequest,
  extractRelevantQueryParams,
  evaluateTrackingRuntime,
  type NetworkEvidenceEntry,
} from './network-evidence.js';

describe('matchTrackingRequest', () => {
  it('matches the GA4 Measurement Protocol collect endpoint', () => {
    const match = matchTrackingRequest('https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&en=page_view');
    expect(match).toEqual({ provider: 'GA4', matchedSignature: 'www.google-analytics.com/g/collect', confidence: 'HIGH' });
  });

  it('matches the regional GA4 collect endpoint', () => {
    const match = matchTrackingRequest('https://region1.google-analytics.com/g/collect?tid=G-XYZ');
    expect(match?.provider).toBe('GA4');
  });

  it('matches the Meta Pixel beacon endpoint', () => {
    const match = matchTrackingRequest('https://www.facebook.com/tr?id=123456&ev=PageView');
    expect(match).toEqual({ provider: 'META_PIXEL', matchedSignature: 'facebook.com/tr', confidence: 'HIGH' });
  });

  it('matches the GTM container script load', () => {
    const match = matchTrackingRequest('https://www.googletagmanager.com/gtm.js?id=GTM-ABCDEF');
    expect(match?.provider).toBe('GTM');
    expect(match?.confidence).toBe('MEDIUM');
  });

  it('does not match the GTM gtag.js script load as GA4 firing (script load ≠ event fired)', () => {
    const match = matchTrackingRequest('https://www.googletagmanager.com/gtag/js?id=G-ABC123');
    expect(match).toBeNull();
  });

  it('does not match the Meta Pixel library script load as a fired event', () => {
    const match = matchTrackingRequest('https://connect.facebook.net/en_US/fbevents.js');
    expect(match).toBeNull();
  });

  it('ignores unrelated third-party and first-party requests', () => {
    expect(matchTrackingRequest('https://example.com/styles.css')).toBeNull();
    expect(matchTrackingRequest('https://cdn.jsdelivr.net/npm/some-lib@1.0.0/dist/lib.js')).toBeNull();
    expect(matchTrackingRequest('https://fonts.googleapis.com/css?family=Roboto')).toBeNull();
  });

  it('never throws on a malformed URL', () => {
    expect(() => matchTrackingRequest('not a url at all')).not.toThrow();
    expect(matchTrackingRequest('not a url at all')).toBeNull();
  });
});

describe('extractRelevantQueryParams', () => {
  it('extracts only the allowlisted tid/en params for GA4', () => {
    const params = extractRelevantQueryParams(
      'https://www.google-analytics.com/g/collect?v=2&tid=G-ABC123&en=page_view&cid=555.123&uid=secret-user-id',
      'GA4'
    );
    expect(params).toEqual({ tid: 'G-ABC123', en: 'page_view' });
    // Never extracts cid/uid — those are per-visitor identifiers, not in the allowlist.
    expect(params).not.toHaveProperty('cid');
    expect(params).not.toHaveProperty('uid');
  });

  it('extracts only the allowlisted id/ev params for Meta Pixel', () => {
    const params = extractRelevantQueryParams('https://www.facebook.com/tr?id=123456&ev=PageView', 'META_PIXEL');
    expect(params).toEqual({ id: '123456', ev: 'PageView' });
  });

  it('never extracts Meta Pixel Advanced Matching params (hashed PII) even though they are not in the allowlist', () => {
    const params = extractRelevantQueryParams(
      'https://www.facebook.com/tr?id=123456&ev=Purchase&ud[em]=aabbccdd1234hashedemail&ud[ph]=eeff5678hashedphone',
      'META_PIXEL'
    );
    expect(params).toEqual({ id: '123456', ev: 'Purchase' });
    expect(Object.keys(params).some((k) => k.startsWith('ud'))).toBe(false);
  });

  it('extracts nothing for GTM (no safe params defined — it is a container, not an event beacon)', () => {
    expect(extractRelevantQueryParams('https://www.googletagmanager.com/gtm.js?id=GTM-X', 'GTM')).toEqual({});
  });
});

describe('evaluateTrackingRuntime', () => {
  function entry(provider: 'META_PIXEL' | 'GA4' | 'GTM', overrides: Partial<NetworkEvidenceEntry> = {}): NetworkEvidenceEntry {
    return {
      provider,
      requestUrl: 'example.com/x',
      method: 'GET',
      timestampMs: Date.now(),
      pageUrl: 'https://example.com',
      resourceType: 'xhr',
      matchedSignature: 'test',
      evidenceType: 'FIRED',
      confidence: 'HIGH',
      relevantQueryParams: {},
      ...overrides,
    };
  }

  it('marks a provider FIRED when a matching request was observed', () => {
    const result = evaluateTrackingRuntime([entry('GA4')], true);
    expect(result.ga4.runtimeStatus).toBe('FIRED');
    expect(result.ga4.matchedRequests).toHaveLength(1);
  });

  it('marks a provider NOT_OBSERVED when capture ran but nothing matched', () => {
    const result = evaluateTrackingRuntime([], true);
    expect(result.ga4.runtimeStatus).toBe('NOT_OBSERVED');
    expect(result.metaPixel.runtimeStatus).toBe('NOT_OBSERVED');
    expect(result.gtm.runtimeStatus).toBe('NOT_OBSERVED');
  });

  it('marks every provider NOT_VERIFIED when no capture attempt was made — never overclaims "broken"', () => {
    const result = evaluateTrackingRuntime([], false);
    expect(result.ga4.runtimeStatus).toBe('NOT_VERIFIED');
    expect(result.metaPixel.runtimeStatus).toBe('NOT_VERIFIED');
    expect(result.gtm.runtimeStatus).toBe('NOT_VERIFIED');
  });

  it('evaluates multiple providers independently in the same capture', () => {
    const result = evaluateTrackingRuntime([entry('GA4'), entry('META_PIXEL')], true);
    expect(result.ga4.runtimeStatus).toBe('FIRED');
    expect(result.metaPixel.runtimeStatus).toBe('FIRED');
    expect(result.gtm.runtimeStatus).toBe('NOT_OBSERVED'); // no matching GTM request, but capture did run
  });

  it('deduplicates nothing but caps matchedRequests at 20 entries for duplicate requests', () => {
    const many = Array.from({ length: 30 }, () => entry('GA4'));
    const result = evaluateTrackingRuntime(many, true);
    expect(result.ga4.runtimeStatus).toBe('FIRED');
    expect(result.ga4.matchedRequests.length).toBe(20);
  });
});
