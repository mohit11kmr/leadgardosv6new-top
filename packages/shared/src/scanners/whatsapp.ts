import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';

export interface WhatsAppLinkInfo {
  rawHref: string;
  decodedHref: string;
  extractedPhone?: string;
  prefilledText?: string;
  isValid: boolean;
}

export interface WhatsAppScanResult {
  findings: Finding[];
  hasWhatsAppLink: boolean;
  validLinksCount: number;
  links: WhatsAppLinkInfo[];
}

export function scanWhatsApp(page: PageRecord, context?: ScannerContext): WhatsAppScanResult {
  const findings: Finding[] = [];
  const html = page.html;
  const countryMode = context?.countryMode ?? 'IN';

  // Matches wa.me, api.whatsapp.com, web.whatsapp.com, whatsapp:// links
  const waRegex = /(?:https?:\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)[^"'<>\s]*|whatsapp:\/\/[^"'<>\s]*)/gi;
  const rawLinks = [...html.matchAll(waRegex)].map((m) => m[0]);
  const uniqueLinks = [...new Set(rawLinks)];

  let validLinksCount = 0;
  const linksInfo: WhatsAppLinkInfo[] = [];

  for (const rawLink of uniqueLinks) {
    let decodedLink = rawLink;
    try {
      decodedLink = decodeURIComponent(rawLink);
    } catch {
      // Keep raw if malformed encoding
    }

    // Robust phone number & prefilled text extraction from URL path or query params
    let extractedPhone = '';
    let prefilledText = '';

    try {
      const parsedUrl = new URL(
        decodedLink.startsWith('whatsapp://')
          ? `https://wa.me/${decodedLink.replace('whatsapp://', '')}`
          : decodedLink
      );
      // Check query param 'phone'
      const phoneParam = parsedUrl.searchParams.get('phone');
      const textParam = parsedUrl.searchParams.get('text');
      if (textParam) prefilledText = textParam;

      if (phoneParam) {
        extractedPhone = phoneParam.trim();
      } else {
        // Path extraction (e.g. wa.me/919876543210 or api.whatsapp.com/send?phone=...)
        const pathPart = parsedUrl.pathname.replace(/^\/send\/?/, '').replace(/^\//, '').split('/')[0] ?? '';
        if (pathPart) {
          extractedPhone = pathPart.split('?')[0] ?? '';
        }
      }
    } catch {
      // Fallback regex extraction
      const match = decodedLink.match(/(?:wa\.me\/|phone=)([0-9+]+)/i);
      if (match?.[1]) {
        extractedPhone = match[1];
      }
      const textMatch = decodedLink.match(/[?&]text=([^&]+)/i);
      if (textMatch?.[1]) {
        prefilledText = textMatch[1];
      }
    }

    const digitsOnly = extractedPhone.replace(/\D/g, '');
    let isValid = true;

    if (!digitsOnly || digitsOnly.length < 5) {
      isValid = false;
      findings.push({
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_MALFORMED',
        normalizedIssueKey: 'WHATSAPP_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp link is missing a valid destination phone number',
        description: `Found an empty or invalid WhatsApp link without a usable telephone number: "${rawLink.slice(0, 80)}"`,
        affectedUrl: page.url,
        evidence: {
          source: 'a[href*="whatsapp"]',
          observed: rawLink,
          location: page.url,
          why: 'An empty or non-numeric WhatsApp destination link fails to open a conversation window, losing the prospective lead.',
          recommendation: 'Specify a valid destination phone number with country code (e.g., https://wa.me/919876543210).',
          metadata: { rawLink, extractedPhone },
        },
        recommendation: 'Update the WhatsApp link to include your full verified business telephone number.',
        scoreImpact: 18,
        businessImpact: 'Visitors tapping the WhatsApp button encounter an error rather than initiating a conversation.',
      });
    } else {
      // Check 1: Leading 0 before number (e.g. wa.me/0919876543210 or wa.me/09876543210)
      if (extractedPhone.startsWith('0')) {
        isValid = false;
        findings.push({
          ruleId: 'LG-001',
          internalKey: 'WHATSAPP_LEADING_ZERO',
          normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
          category: 'LEAD',
          scope: 'PAGE',
          severity: 'HIGH',
          title: 'WhatsApp number contains an invalid leading zero prefix',
          description: `The WhatsApp link "${rawLink.slice(0, 80)}" includes a leading 0 ("${extractedPhone}"). WhatsApp requires international format without leading zeros.`,
          affectedUrl: page.url,
          evidence: {
            source: 'a[href*="whatsapp"]',
            observed: rawLink,
            location: page.url,
            why: 'Leading 0 prefix breaks WhatsApp direct routing: WhatsApp API cannot resolve phone numbers prefixed with trunk prefix 0, causing the chat window to fail.',
            recommendation: `Remove the leading 0 (e.g. use "https://wa.me/${digitsOnly.replace(/^0+/, '')}").`,
            metadata: { rawLink, extractedPhone },
          },
          recommendation: 'Remove the leading zero from the WhatsApp phone number parameter.',
          scoreImpact: 18,
          businessImpact: 'Mobile visitors tapping the link receive "Phone number shared via url is invalid".',
        });
      }

      // Check 2: Duplicated country code (e.g. wa.me/91919876543210 for IN mode)
      if (countryMode === 'IN' && digitsOnly.startsWith('9191') && digitsOnly.length >= 14) {
        isValid = false;
        findings.push({
          ruleId: 'LG-001',
          internalKey: 'WHATSAPP_DUPLICATE_CC',
          normalizedIssueKey: 'WHATSAPP_DUPLICATE_CC',
          category: 'LEAD',
          scope: 'PAGE',
          severity: 'HIGH',
          title: 'WhatsApp number contains a duplicated country code prefix',
          description: `The WhatsApp link "${rawLink.slice(0, 80)}" duplicates the country code (+91+91), corrupting the telephone destination.`,
          affectedUrl: page.url,
          evidence: {
            source: 'a[href*="whatsapp"]',
            observed: rawLink,
            location: page.url,
            why: 'Duplicated +91 country prefix causes number resolution failure: Double country prefix creates an invalid 14-digit number that does not route to any subscriber.',
            recommendation: `Remove the extra +91 prefix (e.g. "https://wa.me/${digitsOnly.slice(2)}").`,
            metadata: { rawLink, extractedPhone },
          },
          recommendation: 'Remove duplicate country prefix to restore instant WhatsApp routing.',
          scoreImpact: 18,
          businessImpact: 'Inbound WhatsApp leads are sent to an invalid recipient number and lost permanently.',
        });
      }

      if (isValid) {
        validLinksCount += 1;
      }
    }

    linksInfo.push({
      rawHref: rawLink,
      decodedHref: decodedLink,
      extractedPhone,
      prefilledText,
      isValid,
    });
  }

  return {
    findings,
    hasWhatsAppLink: uniqueLinks.length > 0,
    validLinksCount,
    links: linksInfo,
  };
}

export function runWhatsAppScanner(page: PageRecord, context?: ScannerContext): ScannerResult {
  try {
    const res = scanWhatsApp(page, context);
    return {
      scannerKey: 'WHATSAPP',
      status: 'COMPLETED',
      findings: res.findings,
      metrics: {
        hasWhatsAppLink: res.hasWhatsAppLink,
        validLinksCount: res.validLinksCount,
        totalLinksCount: res.links.length,
      },
    };
  } catch (error) {
    return {
      scannerKey: 'WHATSAPP',
      status: 'FAILED',
      findings: [],
      error: error instanceof Error ? error.message : 'Unknown scanner error',
    };
  }
}
