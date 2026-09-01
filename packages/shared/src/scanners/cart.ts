import type { PageRecord, ScannerContext, ScannerResult } from '../types.js';

const STORE_INDICATOR_KEYWORDS = [
  'add to cart',
  'add to bag',
  'buy now',
  'shop now',
  'add to basket',
];

const CART_LINK_PATTERN = /\/(cart|basket)(\/|$|\?)/i;
const CHECKOUT_LINK_PATTERN = /\/checkout(\/|$|\?)/i;

export interface CartScanResult {
  /** This page shows signs of being an e-commerce product/store page (has "Add to Cart" etc). */
  hasStoreIndicator: boolean;
  /** A link to a cart page (e.g. /cart) was found on this page. */
  hasCartLink: boolean;
  /** A link to a checkout page (e.g. /checkout) was found on this page. */
  hasCheckoutLink: boolean;
  /** This page's own URL is itself a cart/checkout route. */
  isCartOrCheckoutPage: boolean;
}

/**
 * Detects e-commerce cart/checkout signals on a single crawled page.
 * Conservative by design (like scanFormsAndCtas): only flags a site as a
 * "store" when explicit purchase-intent keywords are present, so lead-gen
 * sites (consultancies, agencies) that happen to link to unrelated "/cart"-
 * shaped URLs aren't misclassified.
 */
export function scanCartSignals(page: PageRecord, _context?: ScannerContext): CartScanResult {
  const html = page.html;
  const lowerHtml = html.toLowerCase();

  const hasStoreIndicator = STORE_INDICATOR_KEYWORDS.some((kw) => lowerHtml.includes(kw));

  const links = [...html.matchAll(/<a[^>]+href=["']([^"']*)["']/gi)].map((m) => m[1] ?? '');
  const hasCartLink = links.some((href) => CART_LINK_PATTERN.test(href));
  const hasCheckoutLink = links.some((href) => CHECKOUT_LINK_PATTERN.test(href));

  const pageUrl = page.finalUrl || page.url;
  const isCartOrCheckoutPage = CART_LINK_PATTERN.test(pageUrl) || CHECKOUT_LINK_PATTERN.test(pageUrl);

  return { hasStoreIndicator, hasCartLink, hasCheckoutLink, isCartOrCheckoutPage };
}

export function runCartScanner(page: PageRecord, context?: ScannerContext): ScannerResult {
  try {
    const res = scanCartSignals(page, context);
    return {
      scannerKey: 'CART',
      status: 'COMPLETED',
      findings: [],
      metrics: { ...res },
    };
  } catch (error) {
    return {
      scannerKey: 'CART',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown scanner error',
    };
  }
}
