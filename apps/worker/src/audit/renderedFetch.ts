import { chromium, type Browser } from 'playwright-core';
import { validateExternalUrl } from '@leadguard/shared';

/**
 * Renders a page with a real headless browser and returns the fully
 * JS-executed DOM HTML. This exists specifically to catch tracking pixels,
 * forms, and CTAs that are injected by client-side JavaScript (React/Vue/
 * Next.js SPA shells) rather than present in the initial HTML response,
 * which the primary plain-fetch crawler (fetcher.ts/crawler.ts) cannot see.
 *
 * Best-effort and non-fatal by design: any failure (navigation error,
 * timeout, browser launch failure) returns null rather than throwing, since
 * this is an enhancement layered on top of a working static-HTML audit, not
 * a required step.
 */
export async function fetchRenderedHtml(url: string, signal: AbortSignal, timeoutMs = 15_000): Promise<string | null> {
  // Same SSRF validation the plain-fetch crawler applies — a headless
  // browser navigating to an attacker-controlled internal address is just
  // as dangerous as fetch() doing it.
  //
  // KNOWN RESIDUAL GAP (SEC-1, disclosed not fixed): unlike fetcher.ts /
  // webhookWorker.ts / pdfWorker.ts / vaultRunner.ts's probes, this path is
  // NOT DNS-pinned. Chromium performs its own internal DNS resolution when
  // page.goto() actually navigates, independent of the validation lookup
  // done here, so the same validate-then-connect TOCTOU window this phase
  // closed elsewhere still exists for this one path. Closing it properly
  // would require intercepting/pinning every request Chromium makes (e.g.
  // via Playwright's page.route()), which is a materially larger change
  // than this phase's scope (SSRF security + tests + billing reconciliation
  // wiring) — left as a follow-up rather than attempted here.
  let validatedUrl: URL;
  try {
    validatedUrl = await validateExternalUrl(url);
  } catch {
    return null;
  }

  if (signal.aborted) return null;

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: 'LeadGuardBot/2.0 (+https://leadguard.local)' });
    const page = await context.newPage();

    const abortHandler = () => browser?.close().catch(() => {});
    signal.addEventListener('abort', abortHandler, { once: true });

    try {
      await page.goto(validatedUrl.toString(), { waitUntil: 'networkidle', timeout: timeoutMs });
      const html = await page.content();
      return html;
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
