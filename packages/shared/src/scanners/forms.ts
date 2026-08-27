import type { Finding, PageRecord, ScannerContext } from '../types.js';

export type FormDetectionState =
  | 'FORM_PRESENT'
  | 'CONTACT_CTA_PRESENT'
  | 'LEAD_CTA_PRESENT'
  | 'NO_DETECTABLE_FORM'
  | 'NO_DETECTABLE_CTA';

export interface FormsScanResult {
  findings: Finding[];
  hasForm: boolean;
  hasCta: boolean;
  formCount: number;
  ctaCount: number;
  detectedStates: FormDetectionState[];
}

const CONSERVATIVE_CTA_KEYWORDS = [
  'contact',
  'call',
  'whatsapp',
  'book',
  'get quote',
  'quote',
  'enquire',
  'inquire',
  'request demo',
  'demo',
  'buy now',
  'start',
  'get started',
  'sign up',
  'talk to us',
  'schedule',
  'consultation',
  'reach out',
  'send inquiry',
  'submit',
];

export function scanFormsAndCtas(page: PageRecord, _context?: ScannerContext): FormsScanResult {
  const findings: Finding[] = [];
  const html = page.html;
  const detectedStates: FormDetectionState[] = [];

  // Detect forms (<form ... >)
  const formMatches = [...html.matchAll(/<form[\s>]/gi)];
  const formCount = formMatches.length;

  // Detect submit inputs and buttons (<button ...>, <input type="submit">)
  const submitInputs = [...html.matchAll(/<input[^>]+type=["']submit["']/gi)];
  const submitButtons = [...html.matchAll(/<button[^>]+type=["']submit["']/gi)];
  const generalButtons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi)];

  // Detect CTA anchor links and buttons matching conservative keywords
  const ctaLinks = [...html.matchAll(/<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];

  let ctaCount = 0;
  const detectedCtaSnippets: string[] = [];

  // Check buttons
  for (const button of generalButtons) {
    const text = button[1]?.replace(/<[^>]*>/g, '').trim().toLowerCase() ?? '';
    if (CONSERVATIVE_CTA_KEYWORDS.some((kw) => text.includes(kw))) {
      ctaCount += 1;
      detectedCtaSnippets.push(button[0].slice(0, 100));
    }
  }

  // Check CTA anchors
  for (const link of ctaLinks) {
    const text = link[2]?.replace(/<[^>]*>/g, '').trim().toLowerCase() ?? '';
    const href = link[1] ?? '';
    if (
      CONSERVATIVE_CTA_KEYWORDS.some((kw) => text.includes(kw)) ||
      href.startsWith('tel:') ||
      href.includes('wa.me') ||
      href.includes('whatsapp') ||
      /contact|quote|booking|demo/i.test(href)
    ) {
      ctaCount += 1;
      detectedCtaSnippets.push(link[0].slice(0, 100));
    }
  }

  const hasForm = formCount > 0 || submitInputs.length > 0 || submitButtons.length > 0;
  const hasCta = ctaCount > 0;

  if (hasForm) {
    detectedStates.push('FORM_PRESENT');
  } else {
    detectedStates.push('NO_DETECTABLE_FORM');
  }

  if (hasCta) {
    detectedStates.push('CONTACT_CTA_PRESENT');
    detectedStates.push('LEAD_CTA_PRESENT');
  } else {
    detectedStates.push('NO_DETECTABLE_CTA');
  }

  return {
    findings,
    hasForm,
    hasCta,
    formCount,
    ctaCount,
    detectedStates,
  };
}
