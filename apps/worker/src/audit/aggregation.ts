import {
  inspectTls,
  scanFormsAndCtas,
  scanSecurityHeaders,
  scanTelephone,
  scanTracking,
  scanWhatsApp,
  type Finding,
  type PageRecord,
  type ScannerContext,
} from '@leadguard/shared';

export interface WebsiteSignals {
  hasWhatsApp: boolean;
  hasTelephone: boolean;
  hasForm: boolean;
  hasCta: boolean;
  hasMetaPixel: boolean;
  hasGa4: boolean;
  hasGtm: boolean;
  primaryHeaders: Record<string, string>;
}

export function aggregateWebsiteSignals(pages: PageRecord[]): WebsiteSignals {
  let hasWhatsApp = false;
  let hasTelephone = false;
  let hasForm = false;
  let hasCta = false;
  let hasMetaPixel = false;
  let hasGa4 = false;
  let hasGtm = false;
  let primaryHeaders: Record<string, string> = {};

  if (pages.length > 0) {
    primaryHeaders = pages[0]!.headers;
  }

  for (const page of pages) {
    const wa = scanWhatsApp(page);
    if (wa.validLinksCount > 0) hasWhatsApp = true;

    const tel = scanTelephone(page);
    if (tel.validLinksCount > 0) hasTelephone = true;

    const forms = scanFormsAndCtas(page);
    if (forms.hasForm) hasForm = true;
    if (forms.hasCta) hasCta = true;

    const tracking = scanTracking(page);
    if (tracking.metaPixel.status !== 'NOT_DETECTED') hasMetaPixel = true;
    if (tracking.ga4.status !== 'NOT_DETECTED') hasGa4 = true;
    if (tracking.gtm.status !== 'NOT_DETECTED') hasGtm = true;
  }

  return {
    hasWhatsApp,
    hasTelephone,
    hasForm,
    hasCta,
    hasMetaPixel,
    hasGa4,
    hasGtm,
    primaryHeaders,
  };
}

export async function evaluateWebsiteLevelScanners(
  siteUrl: string,
  signals: WebsiteSignals,
  pages: PageRecord[],
  context?: ScannerContext
): Promise<Finding[]> {
  const findings: Finding[] = [];

  // 1. WhatsApp site CTA presence
  if (!signals.hasWhatsApp) {
    findings.push({
      ruleId: 'LG-001',
      internalKey: 'WHATSAPP_MISSING',
      normalizedIssueKey: 'WHATSAPP_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No WhatsApp CTA detected across the website',
      description: 'No valid WhatsApp chat link (wa.me, api.whatsapp.com, or whatsapp://) was detected on any scanned page.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 WhatsApp links across all crawled pages',
        location: siteUrl,
        why: 'WhatsApp is a primary high-intent conversion channel for direct consumer and business inquiries.',
        recommendation: 'Add a verified WhatsApp floating button or navigation CTA linking to your official business number.',
      },
      recommendation: 'Add a verified WhatsApp CTA to key pages to capture instant mobile inquiries.',
      scoreImpact: 8,
      businessImpact: 'Visitors preferring quick chat over forms cannot reach your team, resulting in lost leads.',
    });
  }

  // 2. Click-to-Call site presence
  if (!signals.hasTelephone) {
    findings.push({
      ruleId: 'LG-003',
      internalKey: 'TEL_MISSING',
      normalizedIssueKey: 'TEL_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'No click-to-call link detected on the website',
      description: 'No tel: phone link was found across any scanned page.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 tel: links found',
        location: siteUrl,
        why: 'Mobile visitors expect instant click-to-call functionality for urgent inquiries.',
        recommendation: 'Add a click-to-call link (e.g. href="tel:+919876543210") in the website header or contact section.',
      },
      recommendation: 'Add a click-to-call phone link in the website header or footer.',
      scoreImpact: 3,
      businessImpact: 'Mobile visitors cannot easily dial your business directly from their browsers.',
    });
  }

  // 3. Contact form & CTA site presence
  if (!signals.hasForm) {
    findings.push({
      ruleId: 'LG-001',
      internalKey: 'CONTACT_FORM_MISSING',
      normalizedIssueKey: 'CONTACT_FORM_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No contact or lead capture form detected',
      description: 'No <form> or submit button was detected across the scanned pages.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: '0 <form> elements detected',
        location: siteUrl,
        why: 'Lead generation websites require structured input forms for capturing prospect inquiries.',
        recommendation: 'Implement an accessible inquiry or contact form with validation.',
      },
      recommendation: 'Add a contact form to capture visitor contact details and inquiry requirements.',
      scoreImpact: 8,
      businessImpact: 'Prospective clients without direct messaging apps cannot submit detailed project inquiries.',
    });
  }

  if (!signals.hasCta) {
    findings.push({
      ruleId: 'LG-001',
      internalKey: 'CTA_MISSING',
      normalizedIssueKey: 'CTA_MISSING',
      category: 'LEAD',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'No prominent lead call-to-action (CTA) detected',
      description: 'No prominent action buttons (e.g., "Contact", "Book", "Get Quote", "Request Demo") were detected.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'website_scan',
        observed: 'No standard CTA text detected on buttons or links',
        location: siteUrl,
        why: 'Clear CTAs guide visitor journeys and prompt conversion actions.',
        recommendation: 'Add clear, high-contrast Call-to-Action buttons on high-intent sections.',
      },
      recommendation: 'Add clear Call-to-Action (CTA) buttons throughout key conversion paths.',
      scoreImpact: 6,
      businessImpact: 'Unclear next steps increase page bounce rates and reduce overall conversion momentum.',
    });
  }

  // 4. Tracking probes (Meta Pixel, GA4, GTM)
  if (!signals.hasMetaPixel) {
    findings.push({
      ruleId: 'LG-006',
      internalKey: 'META_PIXEL_MISSING',
      normalizedIssueKey: 'META_PIXEL_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Meta Pixel tracking not detected',
      description: 'No Meta Pixel signature (fbq, connect.facebook.net, fbevents.js) was detected on the website.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No fbq() or connect.facebook.net signatures found',
        location: siteUrl,
        why: 'Meta Pixel allows conversion tracking, retargeting, and lookalike audience optimization for Facebook & Instagram ads.',
        recommendation: 'Install the Meta Pixel base code in the website header.',
      },
      recommendation: 'Install Meta Pixel tracking to enable ad attribution and retargeting.',
      scoreImpact: 4,
      businessImpact: 'Paid Meta ad campaigns cannot track conversions or optimize ad spend effectively.',
    });
  }

  if (!signals.hasGa4) {
    findings.push({
      ruleId: 'LG-007',
      internalKey: 'GA4_MISSING',
      normalizedIssueKey: 'GA4_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Google Analytics 4 (GA4) not detected',
      description: 'No GA4 measurement identifier (G-...) or gtag() tracking call was detected on the website.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No G- measurement ID or gtag() script detected',
        location: siteUrl,
        why: 'Google Analytics 4 provides audience measurement, traffic attribution, and funnel conversion analytics.',
        recommendation: 'Add the Google tag (gtag.js) with your GA4 Measurement ID to all pages.',
      },
      recommendation: 'Deploy GA4 tracking across all pages.',
      scoreImpact: 4,
      businessImpact: 'Website lacks basic traffic analytics and marketing funnel attribution data.',
    });
  }

  if (!signals.hasGtm) {
    findings.push({
      ruleId: 'LG-007',
      internalKey: 'GTM_MISSING',
      normalizedIssueKey: 'GTM_MISSING',
      category: 'ADVERTISING',
      scope: 'WEBSITE',
      severity: 'LOW',
      title: 'Google Tag Manager (GTM) not detected',
      description: 'No Google Tag Manager container (GTM-...) or dataLayer implementation was detected.',
      affectedUrl: siteUrl,
      evidence: {
        source: 'html_scripts',
        observed: 'No GTM- container ID or googletagmanager script detected',
        location: siteUrl,
        why: 'Google Tag Manager allows centralized management of tracking tags, conversion pixels, and event listeners.',
        recommendation: 'Install Google Tag Manager container script in the <head> and <body>.',
      },
      recommendation: 'Consider deploying Google Tag Manager for centralized tag deployment.',
      scoreImpact: 4,
    });
  }

  // 5. Security headers on primary response
  if (pages.length > 0) {
    const dummyPage: PageRecord = {
      url: siteUrl,
      finalUrl: siteUrl,
      statusCode: 200,
      contentType: 'text/html',
      headers: signals.primaryHeaders,
      htmlAvailable: false,
      responseTimeMs: 0,
      depth: 0,
      redirectChain: [],
      html: '',
    };
    const secRes = scanSecurityHeaders(dummyPage, context);
    findings.push(...secRes.findings);
  }

  // 6. Dedicated TLS inspector
  if (siteUrl.startsWith('https://')) {
    try {
      const tlsRes = await inspectTls(siteUrl, context);
      findings.push(...tlsRes.findings);
    } catch {
      // Handled internally in inspectTls
    }
  }

  return findings;
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduplicated: Finding[] = [];

  for (const finding of findings) {
    const issueKey = finding.normalizedIssueKey ?? finding.internalKey ?? finding.title;
    // For WEBSITE or AUDIT scope, deduplicate by ruleId + issueKey across the entire audit
    const key =
      finding.scope === 'PAGE'
        ? `${finding.ruleId}|PAGE|${finding.affectedUrl ?? ''}|${issueKey}`
        : `${finding.ruleId}|${finding.scope}|${issueKey}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}
