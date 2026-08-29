import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';
import { scanTracking } from './tracking.js';

export function runTrackingScanner(page: PageRecord, _context?: ScannerContext): ScannerResult {
  try {
    const res = scanTracking(page);
    const findings: Finding[] = [];

    // Meta Pixel finding per page
    if (res.metaPixel.status === 'NOT_DETECTED') {
      findings.push({
        ruleId: 'LG-006',
        internalKey: 'META_PIXEL_MISSING',
        normalizedIssueKey: 'META_PIXEL_MISSING',
        category: 'ADVERTISING',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Meta Pixel tracking not detected on this page',
        description: 'No Meta Pixel signature (fbq, connect.facebook.net, fbevents.js) was detected on this page.',
        affectedUrl: page.url,
        evidence: {
          source: 'html_scripts',
          observed: 'No fbq() or connect.facebook.net signatures found',
          location: page.url,
          why: 'Meta Pixel allows conversion tracking, retargeting, and lookalike audience optimization for Facebook & Instagram ads.',
          recommendation: 'Install the Meta Pixel base code in the website header.',
        },
        recommendation: 'Install Meta Pixel tracking to enable ad attribution and retargeting.',
        scoreImpact: 4,
        businessImpact: 'Paid Meta ad campaigns cannot track conversions or optimize ad spend effectively on this page.',
      });
    } else if (res.metaPixel.status === 'PARTIAL') {
      findings.push({
        ruleId: 'LG-006',
        internalKey: 'META_PIXEL_PARTIAL',
        normalizedIssueKey: 'META_PIXEL_PARTIAL',
        category: 'ADVERTISING',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Meta Pixel partially detected on this page',
        description: `Meta Pixel signatures found: ${res.metaPixel.signatures.join(', ')}. Full implementation may be incomplete.`,
        affectedUrl: page.url,
        evidence: {
          source: 'html_scripts',
          observed: res.metaPixel.signatures.join('; '),
          location: page.url,
          why: 'Partial Meta Pixel implementation may miss conversion events.',
          recommendation: 'Ensure complete Meta Pixel implementation including fbq initialization and event tracking.',
        },
        recommendation: 'Complete Meta Pixel implementation on this page.',
        scoreImpact: 2,
        businessImpact: 'Incomplete tracking may lead to partial attribution data.',
      });
    }

    // GA4 finding per page
    if (res.ga4.status === 'NOT_DETECTED') {
      findings.push({
        ruleId: 'LG-007',
        internalKey: 'GA4_MISSING',
        normalizedIssueKey: 'GA4_MISSING',
        category: 'ADVERTISING',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Google Analytics 4 (GA4) not detected on this page',
        description: 'No GA4 measurement identifier (G-...) or gtag() tracking call was detected on this page.',
        affectedUrl: page.url,
        evidence: {
          source: 'html_scripts',
          observed: 'No G- measurement ID or gtag() script detected',
          location: page.url,
          why: 'Google Analytics 4 provides audience measurement, traffic attribution, and funnel conversion analytics.',
          recommendation: 'Add the Google tag (gtag.js) with your GA4 Measurement ID to this page.',
        },
        recommendation: 'Deploy GA4 tracking on this page.',
        scoreImpact: 4,
        businessImpact: 'Website lacks basic traffic analytics and marketing funnel attribution data on this page.',
      });
    } else if (res.ga4.status === 'PARTIAL') {
      findings.push({
        ruleId: 'LG-007',
        internalKey: 'GA4_PARTIAL',
        normalizedIssueKey: 'GA4_PARTIAL',
        category: 'ADVERTISING',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'GA4 partially detected on this page',
        description: `GA4 signatures found: ${res.ga4.signatures.join(', ')}. Full implementation may be incomplete.`,
        affectedUrl: page.url,
        evidence: {
          source: 'html_scripts',
          observed: res.ga4.signatures.join('; '),
          location: page.url,
          why: 'Partial GA4 implementation may miss events.',
          recommendation: 'Ensure complete GA4 implementation including gtag config and event tracking.',
        },
        recommendation: 'Complete GA4 implementation on this page.',
        scoreImpact: 2,
        businessImpact: 'Incomplete tracking may lead to partial attribution data.',
      });
    }

    // GTM finding per page
    if (res.gtm.status === 'NOT_DETECTED') {
      findings.push({
        ruleId: 'LG-007',
        internalKey: 'GTM_MISSING',
        normalizedIssueKey: 'GTM_MISSING',
        category: 'ADVERTISING',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Google Tag Manager (GTM) not detected on this page',
        description: 'No Google Tag Manager container (GTM-...) or dataLayer implementation was detected on this page.',
        affectedUrl: page.url,
        evidence: {
          source: 'html_scripts',
          observed: 'No GTM- container ID or googletagmanager script detected',
          location: page.url,
          why: 'Google Tag Manager allows centralized management of tracking tags, conversion pixels, and event listeners.',
          recommendation: 'Install Google Tag Manager container script in the <head> and <body>.',
        },
        recommendation: 'Consider deploying Google Tag Manager for centralized tag deployment.',
        scoreImpact: 4,
        businessImpact: 'Tag management is decentralized, making tracking changes slower and error-prone.',
      });
    }

    return {
      scannerKey: 'TRACKING',
      status: 'COMPLETED',
      findings,
      metrics: {
        metaPixelStatus: res.metaPixel.status,
        ga4Status: res.ga4.status,
        gtmStatus: res.gtm.status,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'TRACKING',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown tracking scanner error',
    };
  }
}