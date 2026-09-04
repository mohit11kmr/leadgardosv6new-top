/**
 * Network-verified tracking evidence — browser-safe pure types + matching
 * logic (no Playwright import here; the actual browser request capture
 * lives in apps/worker/src/audit/renderedFetch.ts, which is the only place
 * that can see real outbound requests during a rendered page visit).
 *
 * This module exists to close a real detection gap: packages/shared's
 * tracking.ts only ever checks whether tracking *code* (a script tag, a
 * measurement ID, a dataLayer reference) is present in a page's static or
 * rendered HTML — it never confirms the tag actually *fires* a network
 * request. A site can have a GA4 snippet sitting in its <head> that never
 * sends a single event (blocked by a consent manager, a CSP violation, a
 * typo'd measurement ID) and this scanner would previously report "GA4
 * DETECTED" regardless. The types and matching logic here let a runtime
 * network capture upgrade that static claim into an actually-verified one,
 * or flag it as present-but-not-firing — without ever downgrading a real
 * static finding into a false "broken" one when we simply didn't get a
 * chance to check (rescan disabled, renderer failed, etc).
 */

export const trackingProviders = ['META_PIXEL', 'GA4', 'GTM'] as const;
export type TrackingProvider = (typeof trackingProviders)[number];

/**
 * FIRED: a matching outbound request was observed during the rendered page
 *   visit — the tag is confirmed working.
 * NOT_OBSERVED: a real network-capture attempt was made (the renderer
 *   launched and ran to completion) but no matching request appeared —
 *   this is the "present but possibly misconfigured" signal.
 * NOT_VERIFIED: no capture attempt was made or it failed before completing
 *   (rescan disabled, browser launch failure, navigation timeout) — we
 *   simply don't know, and must never report this as "broken".
 */
export const trackingRuntimeStatuses = ['FIRED', 'NOT_OBSERVED', 'NOT_VERIFIED'] as const;
export type TrackingRuntimeStatus = (typeof trackingRuntimeStatuses)[number];

/**
 * One normalized, redacted, JSON-serializable record of an observed outbound
 * request that matched a known tracking-provider signature. Deliberately
 * narrow: no headers, no cookies, no full URL (hostname+path only), and only
 * an explicit allowlist of non-sensitive query params ever gets copied in —
 * see extractRelevantQueryParams below. Never build this from a raw
 * Playwright Request object anywhere outside renderedFetch.ts; that object
 * exposes headers/postData that must never enter this pipeline at all.
 */
export interface NetworkEvidenceEntry {
  provider: TrackingProvider;
  /** hostname + pathname only — never includes the query string or fragment */
  requestUrl: string;
  method: string;
  timestampMs: number;
  pageUrl: string;
  resourceType: string;
  matchedSignature: string;
  evidenceType: 'FIRED';
  confidence: 'HIGH' | 'MEDIUM';
  relevantQueryParams: Record<string, string>;
}

export interface TrackingProviderMatch {
  provider: TrackingProvider;
  matchedSignature: string;
  confidence: 'HIGH' | 'MEDIUM';
}

const GA4_QUERY_ALLOWLIST = new Set(['tid', 'en']); // measurement id + event name — both already public/static-visible

/**
 * Matches an outbound request URL against known tracking-provider network
 * signatures. Pure/deterministic — safe to unit test without a browser.
 * Returns null for anything that doesn't match a known tracking endpoint
 * (the overwhelming majority of requests on any real page).
 */
export function matchTrackingRequest(url: string, resourceType?: string): TrackingProviderMatch | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  // Meta Pixel: the actual beacon endpoint, not the connect.facebook.net
  // script load (that only proves the library loaded, not that an event
  // fired).
  if (host === 'www.facebook.com' || host === 'facebook.com') {
    if (path === '/tr' || path === '/tr/') {
      return { provider: 'META_PIXEL', matchedSignature: 'facebook.com/tr', confidence: 'HIGH' };
    }
  }

  // GA4: the Measurement Protocol collect endpoint, across the legacy and
  // regional hostnames Google uses. This is the actual event beacon; the
  // gtag.js script load (googletagmanager.com/gtag/js) is deliberately not
  // treated as "fired" for the same reason as GTM below.
  if (
    (host === 'www.google-analytics.com' || host === 'google-analytics.com' || host.endsWith('.google-analytics.com') || host === 'analytics.google.com') &&
    (path === '/g/collect' || path.startsWith('/g/collect'))
  ) {
    return { provider: 'GA4', matchedSignature: `${host}${path}`, confidence: 'HIGH' };
  }

  // GTM: unlike GA4/Meta, GTM has no single "event fired" endpoint of its
  // own — it's a container that loads and manages other tags. Observing the
  // container script actually load (not just referenced in static HTML) is
  // the honest, testable signal available here: it proves the container
  // executes, not that every tag inside it fires. This limitation is
  // documented in docs/DETECTION_INTEGRITY.md.
  if (host === 'www.googletagmanager.com' || host === 'googletagmanager.com') {
    if (path === '/gtm.js') {
      return { provider: 'GTM', matchedSignature: 'googletagmanager.com/gtm.js', confidence: 'MEDIUM' };
    }
  }

  void resourceType; // reserved for future refinement (e.g. requiring resourceType === 'xhr'/'image'/'script' per provider)
  return null;
}

// Meta Pixel's `id` (pixel ID — already publicly visible in the page's own
// static HTML/script tags, same non-sensitivity rationale as GA4's `tid`)
// and `ev` (event name label, e.g. "PageView"/"Purchase" — just a category
// string). Deliberately EXCLUDES anything under Meta's "Advanced Matching"
// scheme (`ud[em]`, `ud[ph]`, etc.) — those carry hashed customer PII
// (email/phone) and must never be captured even though Meta itself hashes
// them before sending; this allowlist only ever grows by adding a new
// explicit key here, never by widening to "everything except X".
const META_PIXEL_QUERY_ALLOWLIST = new Set(['id', 'ev']);

/**
 * Extracts only a narrow, explicitly-allowlisted set of non-sensitive query
 * parameters for a matched request — e.g. GA4's `tid` (measurement ID,
 * already visible in the page's static HTML) and `en` (event name, just a
 * label like "page_view"). Everything else is dropped; this is an allowlist,
 * not a blocklist, so an unrecognized/new param is never captured by
 * default.
 */
export function extractRelevantQueryParams(url: string, provider: TrackingProvider): Record<string, string> {
  const allowlist = provider === 'GA4' ? GA4_QUERY_ALLOWLIST : provider === 'META_PIXEL' ? META_PIXEL_QUERY_ALLOWLIST : null;
  if (!allowlist) return {};
  try {
    const parsed = new URL(url);
    const out: Record<string, string> = {};
    for (const key of allowlist) {
      const value = parsed.searchParams.get(key);
      if (value !== null) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export interface TrackingProviderRuntimeEvaluation {
  provider: TrackingProvider;
  runtimeStatus: TrackingRuntimeStatus;
  matchedRequests: NetworkEvidenceEntry[];
}

export interface TrackingRuntimeEvaluation {
  metaPixel: TrackingProviderRuntimeEvaluation;
  ga4: TrackingProviderRuntimeEvaluation;
  gtm: TrackingProviderRuntimeEvaluation;
}

const PROVIDER_KEY: Record<TrackingProvider, keyof TrackingRuntimeEvaluation> = {
  META_PIXEL: 'metaPixel',
  GA4: 'ga4',
  GTM: 'gtm',
};

/**
 * Reduces a flat list of captured network evidence into a per-provider
 * runtime verdict. `captureAttempted` distinguishes "we tried and saw
 * nothing" (NOT_OBSERVED) from "we never got a real capture window"
 * (NOT_VERIFIED) — the latter must never be reported as a problem.
 */
export function evaluateTrackingRuntime(
  networkEvidence: NetworkEvidenceEntry[],
  captureAttempted: boolean
): TrackingRuntimeEvaluation {
  const base = (provider: TrackingProvider): TrackingProviderRuntimeEvaluation => {
    const matched = networkEvidence.filter((e) => e.provider === provider);
    const runtimeStatus: TrackingRuntimeStatus = matched.length > 0 ? 'FIRED' : captureAttempted ? 'NOT_OBSERVED' : 'NOT_VERIFIED';
    return { provider, runtimeStatus, matchedRequests: matched.slice(0, 20) };
  };

  return {
    metaPixel: base('META_PIXEL'),
    ga4: base('GA4'),
    gtm: base('GTM'),
  };
}

export function getRuntimeEvaluation(evaluation: TrackingRuntimeEvaluation, provider: TrackingProvider): TrackingProviderRuntimeEvaluation {
  return evaluation[PROVIDER_KEY[provider]];
}
