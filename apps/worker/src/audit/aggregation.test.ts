import { describe, it, expect } from 'vitest';
import { aggregateWebsiteSignals, evaluateWebsiteLevelScanners, mergeRenderedSignals } from './aggregation.js';
import type { PageRecord } from '@leadguard/shared';

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
