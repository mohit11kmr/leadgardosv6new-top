import { describe, it, expect } from 'vitest';
import { scanConsent } from './consent.js';
import type { PageRecord } from '../types.js';

function makePage(html: string): PageRecord {
  return {
    url: 'https://example.test/',
    finalUrl: 'https://example.test/',
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    htmlAvailable: true,
    responseTimeMs: 50,
    depth: 0,
    redirectChain: [],
    html,
  };
}

describe('scanConsent — CMP vendor detection', () => {
  it('detects OneTrust via its CDN script', () => {
    const result = scanConsent(makePage('<script src="https://cdn.cookielaw.org/consent/abc.js"></script>'));
    expect(result.cmpDetected).toBe(true);
    expect(result.cmpVendor).toBe('ONETRUST');
  });

  it('detects Cookiebot via its consent domain', () => {
    const result = scanConsent(makePage('<script src="https://consent.cookiebot.com/uc.js"></script>'));
    expect(result.cmpVendor).toBe('COOKIEBOT');
  });

  it('detects Osano, TrustArc, Iubenda, Didomi, Quantcast, CookieYes, Complianz, Termly independently', () => {
    expect(scanConsent(makePage('<script src="https://cmp.osano.com/x.js"></script>')).cmpVendor).toBe('OSANO');
    expect(scanConsent(makePage('<script src="https://consent.trustarc.com/x.js"></script>')).cmpVendor).toBe('TRUSTARC');
    expect(scanConsent(makePage('<script src="https://cdn.iubenda.com/iubenda.js"></script>')).cmpVendor).toBe('IUBENDA');
    expect(scanConsent(makePage('<script src="https://sdk.privacy-center.org/x.js"></script>')).cmpVendor).toBe('DIDOMI');
    expect(scanConsent(makePage('<script src="https://quantcast.mgr.consensu.org/x.js"></script>')).cmpVendor).toBe('QUANTCAST');
    expect(scanConsent(makePage('<script src="https://cdn-cookieyes.com/x.js"></script>')).cmpVendor).toBe('COOKIEYES');
    expect(scanConsent(makePage('<script>var cmplz_settings={};</script>')).cmpVendor).toBe('COMPLIANZ');
    expect(scanConsent(makePage('<script src="https://app.termly.io/x.js"></script>')).cmpVendor).toBe('TERMLY');
  });

  it('detects a generic IAB TCF implementation when no named vendor matches', () => {
    const result = scanConsent(makePage('<script>window.__tcfapi("getTCData", 2, callback);</script>'));
    expect(result.cmpDetected).toBe(true);
    expect(result.cmpVendor).toBe('GENERIC_TCF');
  });

  it('falls back to a generic banner signal for unbranded cookie-consent UI', () => {
    const result = scanConsent(makePage('<div class="cookie-consent-banner">Accept all cookies</div>'));
    expect(result.cmpDetected).toBe(true);
    expect(result.cmpVendor).toBe('GENERIC_BANNER');
  });

  it('reports no CMP detected for a page with none of the above', () => {
    const result = scanConsent(makePage('<html><body><h1>Just a page</h1></body></html>'));
    expect(result.cmpDetected).toBe(false);
    expect(result.cmpVendor).toBeNull();
    expect(result.signatures).toEqual([]);
  });

  it('prefers a named vendor match over the generic TCF/banner fallbacks when both are present', () => {
    const result = scanConsent(
      makePage('<script src="https://cdn.cookielaw.org/x.js"></script><script>__tcfapi("x",2,cb);</script>')
    );
    expect(result.cmpVendor).toBe('ONETRUST');
  });
});

describe('scanConsent — Google Consent Mode v2', () => {
  it('detects a consent default declaration and extracts known category values', () => {
    const html = `<script>
      gtag('consent', 'default', {
        'ad_storage': 'denied',
        'analytics_storage': 'denied',
        'ad_user_data': 'denied',
        'ad_personalization': 'denied'
      });
    </script>`;
    const result = scanConsent(makePage(html));
    expect(result.consentModeDetected).toBe(true);
    expect(result.consentModeDefaults).toEqual({
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('detects a consent update call even without a default declaration', () => {
    const result = scanConsent(makePage(`<script>gtag('consent', 'update', { analytics_storage: 'granted' });</script>`));
    expect(result.consentModeDetected).toBe(true);
  });

  it('does not report consent mode when neither default nor update calls are present', () => {
    const result = scanConsent(makePage(`<script>gtag('config', 'G-ABC123');</script>`));
    expect(result.consentModeDetected).toBe(false);
    expect(result.consentModeDefaults).toEqual({});
  });

  it('leaves an unrecognized-format category value out of consentModeDefaults rather than guessing', () => {
    const html = `<script>gtag('consent', 'default', { ad_storage: someVariable });</script>`;
    const result = scanConsent(makePage(html));
    expect(result.consentModeDetected).toBe(true);
    expect(result.consentModeDefaults.ad_storage).toBeUndefined();
  });
});
