import type { PageRecord, ScannerContext } from '../types.js';

export type TrackingStatus = 'DETECTED' | 'PARTIAL' | 'NOT_DETECTED';

export interface TrackingScanResult {
  metaPixel: {
    status: TrackingStatus;
    signatures: string[];
  };
  ga4: {
    status: TrackingStatus;
    signatures: string[];
    measurementIds: string[];
  };
  gtm: {
    status: TrackingStatus;
    signatures: string[];
    containerIds: string[];
  };
}

export function scanTracking(page: PageRecord, _context?: ScannerContext): TrackingScanResult {
  const html = page.html;

  // 1. Meta Pixel
  const metaSignatures: string[] = [];
  if (/fbq\s*\(/i.test(html)) metaSignatures.push('fbq() call');
  if (/connect\.facebook\.net/i.test(html)) metaSignatures.push('connect.facebook.net script');
  if (/fbevents\.js/i.test(html)) metaSignatures.push('fbevents.js');
  if (/facebook\.com\/tr\?/i.test(html)) metaSignatures.push('facebook.com/tr noscript pixel');

  const metaPixelStatus: TrackingStatus =
    metaSignatures.length >= 2 ? 'DETECTED' : metaSignatures.length === 1 ? 'PARTIAL' : 'NOT_DETECTED';

  // 2. Google Analytics 4 (GA4)
  const ga4Signatures: string[] = [];
  const ga4Ids = [...html.matchAll(/\b(G-[A-Z0-9_-]+)\b/gi)].map((m) => m[1] ?? '');
  const uniqueGa4Ids = [...new Set(ga4Ids)];

  if (uniqueGa4Ids.length > 0) ga4Signatures.push(`Measurement ID: ${uniqueGa4Ids.join(', ')}`);
  if (/gtag\s*\(\s*['"]config['"]\s*,\s*['"]G-/i.test(html)) ga4Signatures.push('gtag("config", "G-...")');
  if (/googletagmanager\.com\/gtag\/js/i.test(html)) ga4Signatures.push('googletagmanager.com/gtag/js');
  if (/google-analytics\.com\/g\/collect/i.test(html)) ga4Signatures.push('google-analytics.com/g/collect');

  const ga4Status: TrackingStatus =
    uniqueGa4Ids.length > 0 || ga4Signatures.length >= 2
      ? 'DETECTED'
      : ga4Signatures.length === 1
        ? 'PARTIAL'
        : 'NOT_DETECTED';

  // 3. Google Tag Manager (GTM)
  const gtmSignatures: string[] = [];
  const gtmIds = [...html.matchAll(/\b(GTM-[A-Z0-9_-]+)\b/gi)].map((m) => m[1] ?? '');
  const uniqueGtmIds = [...new Set(gtmIds)];

  if (uniqueGtmIds.length > 0) gtmSignatures.push(`Container ID: ${uniqueGtmIds.join(', ')}`);
  if (/googletagmanager\.com\/gtm\.js/i.test(html)) gtmSignatures.push('googletagmanager.com/gtm.js');
  if (/(?:window\.)?dataLayer\s*=/i.test(html) || /dataLayer\.push/i.test(html)) gtmSignatures.push('dataLayer');

  const gtmStatus: TrackingStatus =
    uniqueGtmIds.length > 0 || gtmSignatures.length >= 2
      ? 'DETECTED'
      : gtmSignatures.length === 1
        ? 'PARTIAL'
        : 'NOT_DETECTED';

  return {
    metaPixel: {
      status: metaPixelStatus,
      signatures: metaSignatures,
    },
    ga4: {
      status: ga4Status,
      signatures: ga4Signatures,
      measurementIds: uniqueGa4Ids,
    },
    gtm: {
      status: gtmStatus,
      signatures: gtmSignatures,
      containerIds: uniqueGtmIds,
    },
  };
}
