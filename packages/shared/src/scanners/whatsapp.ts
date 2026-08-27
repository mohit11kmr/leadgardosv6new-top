import type { Finding, PageRecord, ScannerContext, ScannerResult } from '../types.js';

export interface WhatsAppScanResult {
  findings: Finding[];
  hasWhatsAppLink: boolean;
  validLinksCount: number;
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

  for (const rawLink of uniqueLinks) {
    let decodedLink = rawLink;
    try {
      decodedLink = decodeURIComponent(rawLink);
    } catch {
      // Keep raw if malformed encoding
    }

    // Robust phone number extraction from URL path or query params
    let extractedPhone = '';
    try {
      const parsedUrl = new URL(decodedLink.startsWith('whatsapp://') ? `https://wa.me/${decodedLink.replace('whatsapp://', '')}` : decodedLink);
      // Check query param 'phone'
      const phoneParam = parsedUrl.searchParams.get('phone');
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
    }

    const digitsOnly = extractedPhone.replace(/\D/g, '');

    if (!digitsOnly || digitsOnly.length < 5) {
      findings.push({
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_MALFORMED',
        normalizedIssueKey: 'WHATSAPP_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp link contains empty or invalid phone number',
        description: `The WhatsApp link "${rawLink.slice(0, 100)}" does not contain a valid phone number.`,
        affectedUrl: page.url,
        evidence: {
          source: 'href',
          observed: rawLink.slice(0, 150),
          location: page.url,
          why: 'Missing or unparseable phone digits in WhatsApp link',
          recommendation: 'Specify a complete international phone number in the WhatsApp link.',
          metadata: { rawLink, extractedPhone },
        },
        recommendation: 'Ensure all WhatsApp links include a valid international mobile number.',
        scoreImpact: 18,
        businessImpact: 'Visitors tapping WhatsApp will fail to initiate conversation, leading to lost inquiries.',
      });
      continue;
    }

    // Check specific malformations
    let issueReason = '';
    let normalizedIssueKey = 'WHATSAPP_MALFORMED';
    let recommendation = 'Use normalized international formatting (e.g., https://wa.me/919876543210).';

    if (countryMode === 'IN') {
      if (digitsOnly.startsWith('9191')) {
        issueReason = 'Duplicated +91 country code detected (e.g. +91 91...)';
        normalizedIssueKey = 'WHATSAPP_DUPLICATE_COUNTRY_CODE';
        recommendation = 'Remove the duplicate 91 country code prefix.';
      } else if (digitsOnly.startsWith('0')) {
        issueReason = 'Leading 0 prefix detected before country or mobile digits.';
        normalizedIssueKey = 'WHATSAPP_LEADING_ZERO';
        recommendation = 'Remove leading 0 and format with international country code +91.';
      } else if (!digitsOnly.startsWith('91')) {
        issueReason = 'Configured India mode expects a valid +91 country prefix.';
        recommendation = 'Prefix Indian mobile numbers with the 91 country code.';
      } else if (!/^91[6-9]\d{9}$/.test(digitsOnly)) {
        issueReason = 'Number is not a valid 10-digit Indian mobile format (must start with 6-9).';
        recommendation = 'Verify the 10-digit Indian mobile number starts with 6, 7, 8, or 9.';
      }
    } else {
      // Global mode validation: standard E.164 length (7 to 15 digits)
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        issueReason = `Invalid phone number length (${digitsOnly.length} digits). Standard international numbers are 7 to 15 digits.`;
        recommendation = 'Format the phone number with valid international country code (E.164).';
      }
    }

    if (issueReason) {
      findings.push({
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_MALFORMED',
        normalizedIssueKey,
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp number appears malformed',
        description: issueReason,
        affectedUrl: page.url,
        evidence: {
          source: 'href',
          observed: rawLink.slice(0, 150),
          location: page.url,
          why: issueReason,
          recommendation,
          metadata: { rawLink, extractedPhone, digitsOnly, countryMode },
        },
        recommendation,
        scoreImpact: 18,
        businessImpact: 'Prospective leads clicking the WhatsApp CTA will encounter a broken or misrouted chat window.',
      });
    } else {
      validLinksCount += 1;
    }
  }

  return {
    findings,
    hasWhatsAppLink: uniqueLinks.length > 0,
    validLinksCount,
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
        totalLinks: res.hasWhatsAppLink ? res.validLinksCount + res.findings.length : 0,
        validLinks: res.validLinksCount,
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
