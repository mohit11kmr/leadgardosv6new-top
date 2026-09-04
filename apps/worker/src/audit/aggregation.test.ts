import { describe, it, expect } from 'vitest';
import { aggregateWebsiteSignals, evaluateWebsiteLevelScanners, mergeRenderedSignals } from './aggregation.js';
import { evaluateTrackingRuntime } from '@leadguard/shared';
import type { NetworkEvidenceEntry, PageRecord, TrackingRuntimeEvaluation } from '@leadguard/shared';

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
    html: '<html><body><h1>Consulting</h1></body></html>',
    ...overrides,
  };
}

describe('Cart Leakage Monitor (aggregation)', () => {
  it('does not flag a non-store (lead-gen) site for missing cart/checkout', async () => {
    const pages = [makePage({})];
    const signals = aggregateWebsiteSignals(pages);
    expect(signals.isStore).toBe(false);

    const findings = await evaluateWebsiteLevelScanners('https://consulting.test', signals, pages);
    expect(findings.some((f) => f.internalKey === 'CART_LINK_MISSING')).toBe(false);
    expect(findings.some((f) => f.internalKey === 'CART_CHECKOUT_BROKEN')).toBe(false);
  });

  it('flags a store site with no cart/checkout link at all', async () => {
    const pages = [
      makePage({ html: '<html><body><button>Add to Cart</button></body></html>' }),
    ];
    const signals = aggregateWebsiteSignals(pages);
    expect(signals.isStore).toBe(true);
    expect(signals.hasCartLink).toBe(false);

    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages);
    const finding = findings.find((f) => f.internalKey === 'CART_LINK_MISSING');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('HIGH');
  });

  it('flags CRITICAL when the cart/checkout page itself errors during the crawl', async () => {
    const pages = [
      makePage({
        url: 'https://shop.test/',
        finalUrl: 'https://shop.test/',
        html: '<html><body><button>Buy Now</button><a href="/checkout">Checkout</a></body></html>',
      }),
      makePage({
        url: 'https://shop.test/checkout',
        finalUrl: 'https://shop.test/checkout',
        statusCode: 500,
        html: '<html><body>Server Error</body></html>',
      }),
    ];
    const signals = aggregateWebsiteSignals(pages);
    expect(signals.isStore).toBe(true);
    expect(signals.brokenCartOrCheckoutUrls).toContain('https://shop.test/checkout');

    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages);
    const finding = findings.find((f) => f.internalKey === 'CART_CHECKOUT_BROKEN');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('CRITICAL');
    // A working cart/checkout link should NOT also trigger the "missing link" finding.
    expect(findings.some((f) => f.internalKey === 'CART_LINK_MISSING')).toBe(false);
  });

  it('does not flag a store with a working cart link', async () => {
    const pages = [
      makePage({ html: '<html><body><button>Add to Cart</button><a href="/cart">View Cart</a></body></html>' }),
    ];
    const signals = aggregateWebsiteSignals(pages);
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages);
    expect(findings.some((f) => f.internalKey?.startsWith('CART_'))).toBe(false);
  });
});

describe('mergeRenderedSignals (headless-browser rescan merge)', () => {
  const base = aggregateWebsiteSignals([]);

  it('upgrades a missing static signal to present when the rendered pass found it', () => {
    const merged = mergeRenderedSignals(
      { ...base, hasGa4: false, hasWhatsApp: false },
      { ...base, hasGa4: true, hasWhatsApp: false }
    );
    expect(merged.hasGa4).toBe(true);
    expect(merged.hasWhatsApp).toBe(false);
  });

  it('never downgrades a signal the static scan already found', () => {
    const merged = mergeRenderedSignals(
      { ...base, hasForm: true },
      { ...base, hasForm: false }
    );
    expect(merged.hasForm).toBe(true);
  });

  it('leaves cart/store signals untouched (rendered rescan only affects tracking/lead-CTA signals)', () => {
    const merged = mergeRenderedSignals(
      { ...base, isStore: true, hasCartLink: false },
      { ...base, isStore: false, hasCartLink: true }
    );
    expect(merged.isStore).toBe(true);
    expect(merged.hasCartLink).toBe(false);
  });
});

describe('Network-verified tracking findings (evaluateWebsiteLevelScanners + trackingRuntime)', () => {
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
      relevantQueryParams: { tid: 'G-ABC', en: 'page_view' },
    };
  }

  const noGa4Page = () => [makePage({ html: '<html><body>No tags here</body></html>' })];

  it('emits the plain MISSING finding when static code is absent and no capture ran (no rendered rescan)', async () => {
    const pages = noGa4Page();
    const signals = aggregateWebsiteSignals(pages);
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, undefined);
    expect(findings.some((f) => f.internalKey === 'GA4_MISSING')).toBe(true);
    expect(findings.some((f) => f.internalKey === 'GA4_NOT_FIRING')).toBe(false);
  });

  it('does not overclaim "not firing" when capture never ran (NOT_VERIFIED) — silence, not a false problem', async () => {
    const pages = noGa4Page();
    const signals = aggregateWebsiteSignals(pages);
    const trackingRuntime = evaluateTrackingRuntime([], false); // captureAttempted: false
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, trackingRuntime);
    // Still absent statically and unverified at runtime → still the plain MISSING finding, nothing extra invented.
    expect(findings.some((f) => f.internalKey === 'GA4_MISSING')).toBe(true);
    expect(findings.some((f) => f.internalKey === 'GA4_NOT_FIRING')).toBe(false);
  });

  it('upgrades an absent static signal to present when the runtime capture observed it firing', async () => {
    const pages = noGa4Page(); // no static GA4 signature anywhere
    const signals = aggregateWebsiteSignals(pages);
    const trackingRuntime = evaluateTrackingRuntime([ga4Entry()], true);
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, trackingRuntime);
    // A real request fired even though static detection found nothing — must not report it as missing.
    expect(findings.some((f) => f.internalKey === 'GA4_MISSING')).toBe(false);
    expect(findings.some((f) => f.internalKey === 'GA4_NOT_FIRING')).toBe(false);
  });

  it('flags GA4_NOT_FIRING when static code is present but capture ran and observed nothing', async () => {
    const pages = [makePage({ html: '<html><head><script>gtag("config", "G-ABC123");</script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    expect(signals.hasGa4).toBe(true);
    const trackingRuntime = evaluateTrackingRuntime([], true); // captureAttempted: true, nothing matched
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, trackingRuntime);
    const finding = findings.find((f) => f.internalKey === 'GA4_NOT_FIRING');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('MEDIUM');
    expect(findings.some((f) => f.internalKey === 'GA4_MISSING')).toBe(false);
  });

  it('does not flag GA4_NOT_FIRING when static code is present and the runtime capture confirmed it fired', async () => {
    const pages = [makePage({ html: '<html><head><script>gtag("config", "G-ABC123");</script></head></html>' })];
    const signals = aggregateWebsiteSignals(pages);
    const trackingRuntime = evaluateTrackingRuntime([ga4Entry()], true);
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, trackingRuntime);
    expect(findings.some((f) => f.internalKey === 'GA4_MISSING')).toBe(false);
    expect(findings.some((f) => f.internalKey === 'GA4_NOT_FIRING')).toBe(false);
  });

  it('evaluates Meta Pixel and GTM independently of GA4 in the same run', async () => {
    const pages = [
      makePage({
        html: `<html><head>
          <script>fbq('init', '123'); fbq('track', 'PageView');</script>
        </head></html>`,
      }),
    ];
    const signals = aggregateWebsiteSignals(pages);
    expect(signals.hasMetaPixel).toBe(true);
    expect(signals.hasGtm).toBe(false);

    const trackingRuntime: TrackingRuntimeEvaluation = evaluateTrackingRuntime([], true);
    const findings = await evaluateWebsiteLevelScanners('https://shop.test', signals, pages, undefined, trackingRuntime);

    expect(findings.some((f) => f.internalKey === 'META_PIXEL_NOT_FIRING')).toBe(true);
    expect(findings.some((f) => f.internalKey === 'GTM_MISSING')).toBe(true); // absent statically, unrelated to runtime
    expect(findings.some((f) => f.internalKey === 'GTM_NOT_FIRING')).toBe(false);
  });
});
