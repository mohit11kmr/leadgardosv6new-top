import type { PageRecord, ScannerContext } from '../types.js';

export type CmpVendor =
  | 'ONETRUST'
  | 'COOKIEBOT'
  | 'OSANO'
  | 'TRUSTARC'
  | 'IUBENDA'
  | 'DIDOMI'
  | 'QUANTCAST'
  | 'COOKIEYES'
  | 'COMPLIANZ'
  | 'TERMLY'
  | 'GENERIC_TCF'
  | 'GENERIC_BANNER';

export type ConsentCategory = 'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization';
export type ConsentState = 'granted' | 'denied' | 'unknown';

export interface ConsentScanResult {
  cmpDetected: boolean;
  /** Highest-confidence vendor match, or a generic signal if no named vendor matched. Null if nothing detected at all. */
  cmpVendor: CmpVendor | null;
  signatures: string[];
  consentModeDetected: boolean;
  /** Declared defaults per Google Consent Mode v2 category, best-effort regex-extracted (not a JS parser) — 'unknown' when a category is referenced but its value couldn't be determined. */
  consentModeDefaults: Partial<Record<ConsentCategory, ConsentState>>;
}

interface CmpSignature {
  vendor: CmpVendor;
  label: string;
  pattern: RegExp;
}

// Ordered by specificity — a named-vendor match always wins over the
// generic TCF/banner fallbacks below. Each pattern matches either a known
// CDN/script hostname or a well-known global identifier the vendor's SDK
// injects, mirroring the "signature" style already used in tracking.ts.
const CMP_SIGNATURES: CmpSignature[] = [
  { vendor: 'ONETRUST', label: 'cdn.cookielaw.org (OneTrust CDN)', pattern: /cdn\.cookielaw\.org/i },
  { vendor: 'ONETRUST', label: 'OptanonConsent cookie/global', pattern: /OptanonConsent|OneTrust/i },
  { vendor: 'COOKIEBOT', label: 'consent.cookiebot.com', pattern: /consent\.cookiebot\.com/i },
  { vendor: 'COOKIEBOT', label: 'Cookiebot global', pattern: /\bCookiebot\b/i },
  { vendor: 'OSANO', label: 'cmp.osano.com', pattern: /cmp\.osano\.com/i },
  { vendor: 'OSANO', label: 'Osano global', pattern: /\bOsano\b/i },
  { vendor: 'TRUSTARC', label: 'consent.trustarc.com', pattern: /consent\.trustarc\.com/i },
  { vendor: 'TRUSTARC', label: 'TrustArc/truste global', pattern: /trustarc|truste\.com/i },
  { vendor: 'IUBENDA', label: 'cdn.iubenda.com', pattern: /cdn\.iubenda\.com/i },
  { vendor: 'IUBENDA', label: 'Iubenda _iub global', pattern: /\b_iub\b/i },
  { vendor: 'DIDOMI', label: 'sdk.privacy-center.org (Didomi)', pattern: /sdk\.privacy-center\.org/i },
  { vendor: 'DIDOMI', label: 'Didomi global', pattern: /\bDidomi\b/i },
  { vendor: 'QUANTCAST', label: 'quantcast.mgr.consensu.org', pattern: /quantcast\.mgr\.consensu\.org/i },
  { vendor: 'COOKIEYES', label: 'cdn-cookieyes.com', pattern: /cdn-cookieyes\.com/i },
  { vendor: 'COMPLIANZ', label: 'Complianz cmplz global', pattern: /\bcmplz_/i },
  { vendor: 'TERMLY', label: 'app.termly.io', pattern: /app\.termly\.io/i },
];

/** IAB Transparency & Consent Framework API — a standardized signal many CMPs implement regardless of vendor, so it's checked independently of the named-vendor list above. */
const TCF_API_PATTERN = /__tcfapi\s*\(/;

/** Low-confidence, vendor-agnostic fallback: visible cookie-consent UI text/attributes without a recognized CMP script. */
const GENERIC_BANNER_PATTERNS = [
  /class=["'][^"']*cookie-?(consent|banner|notice)[^"']*["']/i,
  /id=["'][^"']*cookie-?(consent|banner|notice)[^"']*["']/i,
  /accept\s+all\s+cookies/i,
  /manage\s+cookie\s+preferences/i,
];

const CONSENT_MODE_DEFAULT_PATTERN = /gtag\s*\(\s*['"]consent['"]\s*,\s*['"]default['"]/;
const CONSENT_MODE_UPDATE_PATTERN = /gtag\s*\(\s*['"]consent['"]\s*,\s*['"]update['"]/;

const CONSENT_CATEGORIES: ConsentCategory[] = ['ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization'];

/**
 * Best-effort, regex-only extraction of a Consent Mode category's declared
 * value near a `gtag('consent', 'default', {...})` call — e.g.
 * `analytics_storage: 'denied'`. Deliberately not a JS parser: if the
 * value can't be found with high confidence, the category is reported as
 * 'unknown' rather than guessed.
 */
function extractConsentDefault(html: string, category: ConsentCategory): ConsentState | null {
  const pattern = new RegExp(`['"]?${category}['"]?\\s*:\\s*['"](granted|denied)['"]`, 'i');
  const match = pattern.exec(html);
  if (!match) return null;
  return match[1]!.toLowerCase() as ConsentState;
}

export function scanConsent(page: PageRecord, _context?: ScannerContext): ConsentScanResult {
  const html = page.html;
  const signatures: string[] = [];
  let cmpVendor: CmpVendor | null = null;

  for (const sig of CMP_SIGNATURES) {
    if (sig.pattern.test(html)) {
      signatures.push(sig.label);
      if (!cmpVendor) cmpVendor = sig.vendor; // first (most specific) match wins
    }
  }

  if (!cmpVendor && TCF_API_PATTERN.test(html)) {
    signatures.push('__tcfapi() — IAB TCF API present (vendor not identified)');
    cmpVendor = 'GENERIC_TCF';
  }

  if (!cmpVendor) {
    for (const pattern of GENERIC_BANNER_PATTERNS) {
      if (pattern.test(html)) {
        signatures.push(`generic cookie-consent UI signal: ${pattern.source}`);
        cmpVendor = 'GENERIC_BANNER';
        break;
      }
    }
  }

  const consentModeDetected = CONSENT_MODE_DEFAULT_PATTERN.test(html) || CONSENT_MODE_UPDATE_PATTERN.test(html);
  const consentModeDefaults: Partial<Record<ConsentCategory, ConsentState>> = {};
  if (consentModeDetected) {
    for (const category of CONSENT_CATEGORIES) {
      const value = extractConsentDefault(html, category);
      if (value) consentModeDefaults[category] = value;
    }
  }

  return {
    cmpDetected: cmpVendor !== null,
    cmpVendor,
    signatures,
    consentModeDetected,
    consentModeDefaults,
  };
}
