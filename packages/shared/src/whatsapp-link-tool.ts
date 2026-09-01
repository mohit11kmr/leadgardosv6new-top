export interface WhatsAppLinkIssue {
  code: 'MALFORMED' | 'LEADING_ZERO' | 'DUPLICATE_CC';
  message: string;
}

export interface WhatsAppLinkValidation {
  isValid: boolean;
  normalizedPhone: string;
  issues: WhatsAppLinkIssue[];
  waLink: string;
  preview: {
    phoneDisplay: string;
    messagePreview: string;
  };
}

/**
 * Standalone WhatsApp link builder + validator for the Link Debugger
 * Sandbox tool (a developer types in a candidate phone number/message and
 * gets back a ready-to-use wa.me link plus any issues, before publishing it
 * on their site). Deliberately mirrors the same three checks the WHATSAPP
 * page scanner (scanners/whatsapp.ts) applies to already-published links —
 * kept as an independent function rather than refactoring that scanner, to
 * avoid touching its well-covered existing test suite.
 */
export function buildAndValidateWhatsAppLink(
  phone: string,
  message?: string,
  countryMode: 'IN' | 'GLOBAL' = 'IN'
): WhatsAppLinkValidation {
  const digitsOnly = phone.replace(/\D/g, '');
  const issues: WhatsAppLinkIssue[] = [];

  if (!digitsOnly || digitsOnly.length < 5) {
    issues.push({
      code: 'MALFORMED',
      message: 'Phone number is missing or too short to be a valid WhatsApp destination.',
    });
  } else {
    if (digitsOnly.startsWith('0')) {
      issues.push({
        code: 'LEADING_ZERO',
        message: 'Remove the leading 0 — WhatsApp requires international format without a trunk prefix.',
      });
    }
    if (countryMode === 'IN' && digitsOnly.startsWith('9191') && digitsOnly.length >= 14) {
      issues.push({
        code: 'DUPLICATE_CC',
        message: 'Country code +91 appears to be duplicated (e.g. +91+91XXXXXXXXXX).',
      });
    }
  }

  const isValid = issues.length === 0;
  const normalizedPhone = digitsOnly.replace(/^0+/, '');
  const waLink = message
    ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${normalizedPhone}`;

  return {
    isValid,
    normalizedPhone,
    issues,
    waLink,
    preview: {
      phoneDisplay: normalizedPhone ? `+${normalizedPhone}` : '(invalid)',
      messagePreview: message ?? '',
    },
  };
}
