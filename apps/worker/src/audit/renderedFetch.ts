import { chromium, type Browser, type Page, type Request as PlaywrightRequest } from 'playwright-core';
import { validateExternalUrl, matchTrackingRequest, extractRelevantQueryParams, type NetworkEvidenceEntry } from '@leadguard/shared';
import { startSsrfSafeProxy } from '../net/ssrfSafeProxy.js';

const MAX_NETWORK_EVIDENCE_ENTRIES = 200;

/**
 * Wires a `page.on('request')` listener onto an already-created Playwright
 * page, populating and returning a live array of normalized, redacted
 * NetworkEvidenceEntry records for every request matching a known
 * tracking-provider signature. Extracted from fetchRenderedHtml so the
 * request → evidence pipeline can be exercised directly in tests against a
 * page the test itself controls (see renderedFetch.test.ts), without any
 * external network dependency — page.route() can fulfill a matched
 * hostname's request entirely locally while this listener still observes
 * it, since the 'request' event and route interception are independent.
 *
 * SECURITY: only request.url(), .method(), and .resourceType() are ever
 * read — never headers, cookies, or post data — and matched URLs are
 * reduced to hostname+path plus a narrow query-param allowlist
 * (matchTrackingRequest/extractRelevantQueryParams) before being stored.
 */
export function attachNetworkEvidenceCapture(page: Page, pageUrl: string): NetworkEvidenceEntry[] {
  const networkEvidence: NetworkEvidenceEntry[] = [];

  const onRequest = (request: PlaywrightRequest) => {
    if (networkEvidence.length >= MAX_NETWORK_EVIDENCE_ENTRIES) return;
    let requestUrl: string;
    try {
      requestUrl = request.url();
    } catch {
      return;
    }
    const match = matchTrackingRequest(requestUrl);
    if (!match) return;

    let hostPath = match.matchedSignature;
    try {
      const parsed = new URL(requestUrl);
      hostPath = `${parsed.hostname}${parsed.pathname}`;
    } catch {
      // fall back to matchedSignature computed above
    }

    let resourceType = 'other';
    try {
      resourceType = request.resourceType();
    } catch {
      // best-effort only
    }

    let method = 'GET';
    try {
      method = request.method();
    } catch {
      // best-effort only
    }

    networkEvidence.push({
      provider: match.provider,
      requestUrl: hostPath,
      method,
      timestampMs: Date.now(),
      pageUrl,
      resourceType,
      matchedSignature: match.matchedSignature,
      evidenceType: 'FIRED',
      confidence: match.confidence,
      relevantQueryParams: extractRelevantQueryParams(requestUrl, match.provider),
    });
  };

  page.on('request', onRequest);
  return networkEvidence;
}

export interface RenderedPageResult {
  html: string | null;
  networkEvidence: NetworkEvidenceEntry[];
  /**
   * True only when the browser pass actually ran a real capture window
   * (launched, navigated, and reached completion or timeout without an
   * exception) — distinguishes "we looked and saw nothing" from "we never
   * got a chance to look" for the tracking runtime-verification scanner.
   * False on any validation/launch/navigation failure.
   */
  captureAttempted: boolean;
}

/**
 * Renders a page with a real headless browser, returning the fully
 * JS-executed DOM HTML *and* a normalized, redacted record of outbound
 * network requests that matched a known tracking-provider signature
 * (see network-evidence.ts). This exists specifically to catch tracking
 * pixels, forms, and CTAs that are injected by client-side JavaScript
 * (React/Vue/Next.js SPA shells) rather than present in the initial HTML
 * response, which the primary plain-fetch crawler (fetcher.ts/crawler.ts)
 * cannot see — and, for network evidence specifically, to confirm a
 * tracking tag actually *fires* a request rather than merely being present
 * in the page source.
 *
 * Best-effort and non-fatal by design: any failure (navigation error,
 * timeout, browser launch failure) returns { html: null, networkEvidence:
 * [], captureAttempted: false } rather than throwing, since this is an
 * enhancement layered on top of a working static-HTML audit, not a required
 * step.
 *
 * SECURITY: this only ever *observes* requests the page's own single
 * validated navigation makes — it never fetches, follows, or navigates to
 * any intercepted URL itself. No header, cookie, or request/response body
 * data is ever read from the Playwright Request object; only request.url()
 * and request.resourceType() are consulted, and matched URLs are reduced to
 * hostname+path plus a narrow query-param allowlist before ever leaving this
 * function (see matchTrackingRequest/extractRelevantQueryParams).
 *
 * SSRF / DNS-rebinding boundary (formerly disclosed as an unfixed gap —
 * closed): the browser is launched pointed at a local SsrfSafeProxy
 * (apps/worker/src/net/ssrfSafeProxy.ts) rather than connecting directly.
 * The proxy pins EVERY request Chromium makes — the initial navigation,
 * every subresource (images/scripts/XHR/fetch/iframes the page's own JS
 * loads), and every redirect hop — to a freshly DNS-resolved,
 * classified-safe IP address, using the same isPrivateOrReservedHost logic
 * every other fetcher in this codebase already relies on. This is real
 * pinning, not a pre-check: HTTPS is tunneled via CONNECT without ever
 * being decrypted, so TLS/certificate validation is unaffected. See
 * docs/DETECTION_INTELLIGENCE_P1.md for the full security boundary writeup.
 */
export async function fetchRenderedHtml(url: string, signal: AbortSignal, timeoutMs = 15_000): Promise<RenderedPageResult> {
  // Initial destination validation — the proxy independently re-validates
  // (and pins) every request including this one, but rejecting an
  // obviously-blocked target before even launching a browser is cheaper.
  let validatedUrl: URL;
  try {
    validatedUrl = await validateExternalUrl(url);
  } catch {
    return { html: null, networkEvidence: [], captureAttempted: false };
  }

  if (signal.aborted) return { html: null, networkEvidence: [], captureAttempted: false };

  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof startSsrfSafeProxy>> | undefined;
  try {
    proxy = await startSsrfSafeProxy();
    browser = await chromium.launch({ headless: true, proxy: { server: proxy.url } });
    const context = await browser.newContext({ userAgent: 'LeadGuardBot/2.0 (+https://leadguard.local)' });
    const page = await context.newPage();
    const networkEvidence = attachNetworkEvidenceCapture(page, url);

    const abortHandler = () => browser?.close().catch(() => {});
    signal.addEventListener('abort', abortHandler, { once: true });

    try {
      await page.goto(validatedUrl.toString(), { waitUntil: 'networkidle', timeout: timeoutMs });
      const html = await page.content();
      if (proxy.blockedHosts.length > 0) {
        console.log(
          JSON.stringify({
            level: 'info',
            service: 'worker',
            event: 'ssrf_proxy_blocked_subresource',
            pageUrl: url,
            blockedCount: proxy.blockedHosts.length,
          })
        );
      }
      return { html, networkEvidence, captureAttempted: true };
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }
  } catch {
    // A capture attempt that failed mid-navigation is still "attempted" if
    // we at least got the request listener wired up and the browser
    // launched — but to keep the non-fatal contract simple and honest
    // (matching the pre-existing behavior of returning null-equivalent on
    // any failure), treat any exception here as captureAttempted: false so
    // the tracking scanner never treats a failed/partial capture as a
    // completed "we looked and saw nothing" verdict.
    return { html: null, networkEvidence: [], captureAttempted: false };
  } finally {
    await browser?.close().catch(() => {});
    await proxy?.close().catch(() => {});
  }
}
