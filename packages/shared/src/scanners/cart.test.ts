import { describe, it, expect } from 'vitest';
import { scanCartSignals } from './cart.js';
import type { PageRecord } from '../types.js';

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
    html: '',
    ...overrides,
  };
}

describe('scanCartSignals', () => {
  it('does not flag a lead-gen site (no purchase-intent keywords) as a store', () => {
    const page = makePage({ html: '<html><body><h1>Book a free consultation</h1></body></html>' });
    const res = scanCartSignals(page);
    expect(res.hasStoreIndicator).toBe(false);
  });

  it('detects store intent from "Add to Cart" text', () => {
    const page = makePage({ html: '<html><body><button>Add to Cart</button></body></html>' });
    const res = scanCartSignals(page);
    expect(res.hasStoreIndicator).toBe(true);
  });

  it('detects a cart link', () => {
    const page = makePage({ html: '<html><body><a href="/cart">View Cart</a></body></html>' });
    const res = scanCartSignals(page);
    expect(res.hasCartLink).toBe(true);
    expect(res.hasCheckoutLink).toBe(false);
  });

  it('detects a checkout link', () => {
    const page = makePage({ html: '<html><body><a href="/checkout">Checkout</a></body></html>' });
    const res = scanCartSignals(page);
    expect(res.hasCheckoutLink).toBe(true);
  });

  it('identifies the page itself as a cart/checkout route by URL', () => {
    const page = makePage({ url: 'https://shop.test/checkout', finalUrl: 'https://shop.test/checkout' });
    const res = scanCartSignals(page);
    expect(res.isCartOrCheckoutPage).toBe(true);
  });

  it('does not misclassify unrelated URLs containing "cart" as substrings', () => {
    const page = makePage({ url: 'https://shop.test/cartography-services' });
    const res = scanCartSignals(page);
    expect(res.isCartOrCheckoutPage).toBe(false);
  });
});
