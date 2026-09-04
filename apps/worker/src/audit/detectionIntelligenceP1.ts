import {
  scanConsent,
  scanHreflang,
  type CmpVendor,
  type Finding,
  type PageRecord,
  type TrackingProvider,
  type TrackingRuntimeEvaluation,
} from '@leadguard/shared';
import { detectDuplicateContent } from './duplicateContent.js';
import type { WebsiteSignals } from './aggregation.js';

const PROVIDER_LABEL: Record<TrackingProvider, string> = {
  GA4: 'Google Analytics 4',
  META_PIXEL: 'Meta Pixel',
  GTM: 'Google Tag Manager',
};

/**
 * Website-level consent findings: whether ANY crawled page shows a CMP
 * (same OR-combine pattern aggregateWebsiteSignals already uses for
 * tracking signals — a banner often only renders once per session, so
 * per-page absence isn't a reliable independent signal), plus the
 * consent+tracking correlation.
 *
 * Correlation model: LeadGuard's headless browser NEVER simulates clicking
 * a consent banner (no click, no interaction at all) — see
 * docs/DETECTION_INTELLIGENCE_P1.md. That means ANY tracking request
 * observed during the capture window fired without any explicit consent
 * action having occurred, by construction. So when a CMP is present AND a
 * tracker's runtimeStatus is FIRED, "this tracker fired before consent was
 * established" is a directly observable fact, not an inference — no
 * consent-banner-click simulation needed. When trackingRuntime is
 * unavailable (rescan disabled/failed) or a provider's status is
 * NOT_VERIFIED, correlation is UNKNOWN and never escalated to a finding —
 * per the explicit instruction to never turn UNKNOWN into FAIL.
 */
export function evaluateConsentFindings(
  pages: PageRecord[],
  signals: WebsiteSignals,
  trackingRuntime: TrackingRuntimeEvaluation | undefined,
  siteUrl: string
): Finding[] {
  const findings: Finding[] = [];

  let cmpDetected = false;
  let cmpVendor: CmpVendor | null = null;
  let consentModeDetected = false;
  for (const page of pages) {
    const result = scanConsent(page);
    if (result.cmpDetected && !cmpDetected) {
      cmpDetected = true;
      cmpVendor = result.cmpVendor;
    }
    if (result.consentModeDetected) consentModeDetected = true;
  }

  const anyTrackingPresent =
    signals.hasMetaPixel ||
    signals.hasGa4 ||
    signals.hasGtm ||
    (trackingRuntime
      ? trackingRuntime.metaPixel.runtimeStatus === 'FIRED' ||
        trackingRuntime.ga4.runtimeStatus === 'FIRED' ||
        trackingRuntime.gtm.runtimeStatus === 'FIRED'
      : false);

  if (anyTrackingPresent && !cmpDetected) {
    findings.push({
      ruleId: 'LG-042',
      internalKey: 'NO_CONSENT_MECHANISM_DETECTED',
      normalizedIssueKey: 'NO_CONSENT_MECHANISM_DETECTED',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'No cookie consent mechanism detected alongside active tracking',
      description:
        'This website runs tracking/analytics code, but no cookie consent management platform (CMP) or generic consent banner was observed on any crawled page. This is an observed implementation signal, not a legal compliance determination — verify against the specific regulatory requirements that apply to this site\'s audience.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'consent_scan',
        observed: 'Tracking code present; 0 CMP/consent-banner signatures found across crawled pages',
        location: siteUrl,
        why: 'Many jurisdictions require obtaining consent before setting non-essential tracking cookies — running trackers with no visible consent mechanism is a common, easily-fixed gap.',
        recommendation: 'Deploy a consent management platform (e.g. OneTrust, Cookiebot, or an IAB TCF-compliant CMP) before non-essential trackers load.',
      },
      recommendation: 'Add a cookie consent mechanism before tracking scripts load.',
      scoreImpact: 3,
      metadata: { confidence: 'OBSERVED' },
    });
  }

  if (cmpDetected && trackingRuntime) {
    const providers: TrackingProvider[] = ['GA4', 'META_PIXEL', 'GTM'];
    for (const provider of providers) {
      const evaluation = trackingRuntime[provider === 'GA4' ? 'ga4' : provider === 'META_PIXEL' ? 'metaPixel' : 'gtm'];
      if (evaluation.runtimeStatus === 'FIRED') {
        findings.push({
          ruleId: 'LG-043',
          internalKey: `TRACKER_FIRED_BEFORE_CONSENT_${provider}`,
          normalizedIssueKey: `TRACKER_FIRED_BEFORE_CONSENT_${provider}`,
          category: 'SECURITY',
          scope: 'WEBSITE',
          severity: 'MEDIUM',
          title: `${PROVIDER_LABEL[provider]} request observed before any consent action`,
          description: `A consent mechanism (${cmpVendor ?? 'unidentified CMP'}) is present on this site, and a ${PROVIDER_LABEL[provider]} tracking request was observed during a page visit in which no consent interaction occurred (this scan never clicks or interacts with consent banners) — meaning the tracker fired without the visitor granting consent first.`,
          affectedUrl: siteUrl,
          evidence: {
            source: 'consent_tracking_correlation',
            observed: `cmpVendor=${cmpVendor}; provider=${provider}; runtimeStatus=FIRED`,
            location: siteUrl,
            why: 'A tracker that fires before consent is granted defeats the purpose of having a consent mechanism at all, and is a common source of regulatory exposure.',
            recommendation: `Verify ${PROVIDER_LABEL[provider]} is properly gated behind the CMP's consent signal (e.g. Google Consent Mode default state, or loading the tag only after consent is granted).`,
          },
          recommendation: `Gate ${PROVIDER_LABEL[provider]} behind explicit visitor consent.`,
          scoreImpact: 4,
          businessImpact: 'Tracking data collected before consent may be legally unusable and exposes the business to regulatory risk.',
          metadata: { confidence: 'OBSERVED', consentModeDetected },
        });
      }
    }
  }

  return findings;
}

/**
 * Cross-page hreflang reciprocity: does page B declare an hreflang entry
 * pointing back to page A, for every A that declares one pointing at B?
 * This needs the full crawled page set (unlike the per-page hreflang-page.ts
 * scanner's page-local checks), so it lives here rather than in the
 * registry-driven page scanner.
 */
export function evaluateHreflangReciprocity(pages: PageRecord[], siteUrl: string): Finding[] {
  const declarationsByPage = new Map<string, Set<string>>(); // pageUrl -> set of "lang|href" it declares

  for (const page of pages) {
    const result = scanHreflang(page);
    const pageUrl = page.finalUrl || page.url;
    const set = new Set<string>();
    for (const d of result.declarations) set.add(`${d.lang}|${normalizeForCompare(d.href)}`);
    declarationsByPage.set(normalizeForCompare(pageUrl), set);
  }

  const missingReciprocals: Array<{ from: string; to: string }> = [];
  const crawledUrls = new Set(declarationsByPage.keys());

  for (const [pageUrl, declarations] of declarationsByPage.entries()) {
    for (const entry of declarations) {
      const [, targetHref] = entry.split('|');
      if (!targetHref || targetHref === pageUrl) continue; // self-reference, not a reciprocity concern
      if (!crawledUrls.has(targetHref)) continue; // target wasn't crawled — can't verify either way, not flagged (UNKNOWN, not FAIL)

      const targetDeclarations = declarationsByPage.get(targetHref)!;
      const hasReciprocal = [...targetDeclarations].some((d) => d.split('|')[1] === pageUrl);
      if (!hasReciprocal) {
        missingReciprocals.push({ from: pageUrl, to: targetHref });
      }
    }
  }

  if (missingReciprocals.length === 0) return [];

  return [
    {
      ruleId: 'LG-041',
      internalKey: 'HREFLANG_MISSING_RECIPROCAL',
      normalizedIssueKey: 'HREFLANG_MISSING_RECIPROCAL',
      category: 'SEO',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'Hreflang declarations are not reciprocal across pages',
      description: `${missingReciprocals.length} hreflang relationship(s) point at a crawled page that does not declare a matching hreflang entry back — Google's guidance requires hreflang annotations to be reciprocal to be honored.`,
      affectedUrl: siteUrl,
      evidence: {
        source: 'hreflang_reciprocity',
        observed: missingReciprocals.map((r) => `${r.from} → ${r.to} (no return declaration)`).join('; '),
        location: siteUrl,
        why: 'Non-reciprocal hreflang annotations are commonly ignored by search engines, silently disabling the international/language targeting the site intended.',
        recommendation: 'Ensure every page in an hreflang set declares alternates for every other page in the set, including itself.',
      },
      recommendation: 'Add the missing reciprocal hreflang declarations on the target pages.',
      scoreImpact: 2,
      metadata: { missingReciprocalCount: missingReciprocals.length },
    },
  ];
}

function normalizeForCompare(url: string): string {
  return url.replace(/\/$/, '').replace(/^https?:\/\//i, '').toLowerCase();
}

/**
 * Website-level duplicate-content findings, one per group, using the
 * exact-match-after-normalization strategy in duplicateContent.ts (see
 * that file's header comment for the full explainability rationale).
 */
export function evaluateDuplicateContentFindings(pages: PageRecord[], siteUrl: string): Finding[] {
  const groups = detectDuplicateContent(pages);
  if (groups.length === 0) return [];

  return groups.map((group, index) => ({
    ruleId: 'LG-044',
    internalKey: 'DUPLICATE_CONTENT',
    normalizedIssueKey: `DUPLICATE_CONTENT_${index}`,
    category: 'SEO' as const,
    scope: 'WEBSITE' as const,
    severity: 'MEDIUM' as const,
    title: `${group.urls.length} pages have identical content`,
    description: `These ${group.urls.length} crawled pages produce byte-identical normalized text content: ${group.urls.join(', ')}. No canonical tag was found consolidating them onto a single authoritative URL.`,
    affectedUrl: group.urls[0],
    evidence: {
      source: 'duplicate_content',
      observed: group.urls.join(', '),
      location: siteUrl,
      why: 'Search engines may split ranking signal across duplicate pages instead of consolidating it onto one, and may choose an unintended page as canonical.',
      recommendation: 'Consolidate with a canonical tag pointing at one authoritative URL, or merge/redirect the duplicates.',
      metadata: { normalizedLength: group.normalizedLength },
    },
    recommendation: 'Add a canonical tag consolidating these pages, or merge/redirect the duplicates.',
    scoreImpact: 3,
  }));
}
