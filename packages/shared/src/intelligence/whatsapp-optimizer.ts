import type { Finding, PageRecord } from '../types.js';
import { scanWhatsApp } from '../scanners/whatsapp.js';

export interface QualityDimension {
  score: number;
  status: 'OPTIMAL' | 'ACCEPTABLE' | 'NEEDS_IMPROVEMENT' | 'CRITICAL_FIX';
  details: string;
  recommendations: string[];
}

export interface WhatsAppOptimizationReport {
  overallScore: number;
  hasWhatsAppCta: boolean;
  detectedLinksCount: number;
  dimensions: {
    intentQuality: QualityDimension;
    ctaQuality: QualityDimension;
    phoneQuality: QualityDimension;
    mobileUsability: QualityDimension;
  };
  topRecommendations: string[];
  analyzedUrls: string[];
}

export function analyzeWhatsAppOptimization(
  page?: PageRecord | null,
  findings: Finding[] = []
): WhatsAppOptimizationReport {
  const waScan = page ? scanWhatsApp(page) : { findings: [], links: [], validLinksCount: 0 };
  const waFindings = findings.filter((f) => (f.ruleId === 'LG-001' || f.ruleId === 'LG-002') && f.category === 'LEAD');

  const links = waScan.links;
  const hasWhatsAppCta = links.length > 0;

  // 1. Phone Quality Analysis
  const hasLeadingZero = waFindings.some((f) => f.normalizedIssueKey === 'WHATSAPP_LEADING_ZERO' || f.internalKey === 'WHATSAPP_LEADING_ZERO');
  const hasDuplicateCc = waFindings.some((f) => f.normalizedIssueKey === 'WHATSAPP_DUPLICATE_CC' || f.internalKey === 'WHATSAPP_DUPLICATE_CC');
  const hasEmptyPhone = waFindings.some((f) => f.normalizedIssueKey === 'WHATSAPP_EMPTY_PHONE' || f.internalKey === 'WHATSAPP_EMPTY_PHONE');
  const isMalformed = waFindings.some((f) => f.normalizedIssueKey === 'WHATSAPP_MALFORMED' || f.internalKey === 'WHATSAPP_MALFORMED');

  let phoneScore = 100;
  const phoneRecs: string[] = [];

  if (!hasWhatsAppCta) {
    phoneScore = 0;
    phoneRecs.push('Add an official WhatsApp business telephone number with international country code (e.g. +91).');
  } else if (hasEmptyPhone) {
    phoneScore = 20;
    phoneRecs.push('Specify a destination phone number in WhatsApp href instead of leaving phone parameter empty.');
  } else if (hasLeadingZero) {
    phoneScore = 40;
    phoneRecs.push('Remove leading "0" from local phone number (e.g. use "919876543210" instead of "09876543210").');
  } else if (hasDuplicateCc) {
    phoneScore = 40;
    phoneRecs.push('Remove duplicated country code prefix (e.g. "9191..." -> "91...").');
  } else if (isMalformed) {
    phoneScore = 30;
    phoneRecs.push('Fix malformed WhatsApp link syntax to ensure compatibility across desktop and mobile devices.');
  }

  const phoneStatus = phoneScore >= 90 ? 'OPTIMAL' : phoneScore >= 70 ? 'ACCEPTABLE' : phoneScore >= 40 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL_FIX';

  // 2. Intent Quality Analysis (Prefilled text evaluation)
  let intentScore = 0;
  const intentRecs: string[] = [];
  let prefilledCount = 0;

  if (hasWhatsAppCta) {
    for (const link of links) {
      if (link.prefilledText && link.prefilledText.trim().length > 0) {
        prefilledCount += 1;
        const text = link.prefilledText.toLowerCase();
        if (text.includes('quote') || text.includes('inquiry') || text.includes('booking') || text.includes('demo') || text.includes('help') || text.includes('price')) {
          intentScore = 100;
        } else if (text.length >= 10) {
          intentScore = Math.max(intentScore, 85);
        } else {
          intentScore = Math.max(intentScore, 60);
        }
      }
    }

    if (prefilledCount === 0) {
      intentScore = 30;
      intentRecs.push('Add a pre-filled greeting and inquiry context (e.g. "?text=Hi, I would like to request a demo of...") to initiate conversation instantly.');
    } else if (intentScore < 80) {
      intentRecs.push('Make the pre-filled message more specific to the visitor\'s context (mention service name or inquiry goal).');
    }
  } else {
    intentRecs.push('Deploy pre-filled messages on all WhatsApp conversion entrypoints.');
  }

  const intentStatus = intentScore >= 90 ? 'OPTIMAL' : intentScore >= 70 ? 'ACCEPTABLE' : intentScore >= 40 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL_FIX';

  // 3. CTA Quality Analysis (Button vs bare link, clarity of text)
  let ctaScore = 0;
  const ctaRecs: string[] = [];

  if (hasWhatsAppCta) {
    let hasProminentText = false;
    for (const link of links) {
      const text = link.rawHref.toLowerCase();
      if (text.includes('chat') || text.includes('whatsapp') || text.includes('message') || text.includes('connect')) {
        hasProminentText = true;
      }
    }

    if (hasProminentText) {
      ctaScore = 95;
    } else {
      ctaScore = 65;
      ctaRecs.push('Use descriptive Call-to-Action text like "Chat with Sales on WhatsApp" rather than an icon or bare number.');
    }
  } else {
    ctaScore = 0;
    ctaRecs.push('Add a floating WhatsApp button or sticky header CTA to capture high-intent mobile visitors.');
  }

  const ctaStatus = ctaScore >= 90 ? 'OPTIMAL' : ctaScore >= 70 ? 'ACCEPTABLE' : ctaScore >= 40 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL_FIX';

  // 4. Mobile Usability (Link scheme compatibility)
  let mobileScore = 0;
  const mobileRecs: string[] = [];

  if (hasWhatsAppCta) {
    const hasWaMe = links.some((l) => l.rawHref.includes('wa.me'));
    const hasApiWhatsApp = links.some((l) => l.rawHref.includes('api.whatsapp.com'));
    const hasScheme = links.some((l) => l.rawHref.startsWith('whatsapp://'));

    if (hasWaMe) {
      mobileScore = 100;
    } else if (hasApiWhatsApp) {
      mobileScore = 85;
      mobileRecs.push('Consider upgrading api.whatsapp.com links to modern https://wa.me/ links for faster universal deep-linking.');
    } else if (hasScheme) {
      mobileScore = 70;
      mobileRecs.push('Avoid raw whatsapp:// protocol links as they fail on desktop browsers without WhatsApp installed; use https://wa.me/ instead.');
    } else {
      mobileScore = 50;
      mobileRecs.push('Use canonical https://wa.me/<number> URLs for universal device deep-linking.');
    }
  } else {
    mobileRecs.push('Ensure WhatsApp links use the universal https://wa.me/ URL format.');
  }

  const mobileStatus = mobileScore >= 90 ? 'OPTIMAL' : mobileScore >= 70 ? 'ACCEPTABLE' : mobileScore >= 40 ? 'NEEDS_IMPROVEMENT' : 'CRITICAL_FIX';

  const overallScore = Math.round(
    phoneScore * 0.35 +
    intentScore * 0.25 +
    ctaScore * 0.20 +
    mobileScore * 0.20
  );

  const topRecommendations = [
    ...phoneRecs,
    ...intentRecs,
    ...ctaRecs,
    ...mobileRecs,
  ].slice(0, 5);

  return {
    overallScore,
    hasWhatsAppCta,
    detectedLinksCount: links.length,
    dimensions: {
      phoneQuality: {
        score: phoneScore,
        status: phoneStatus,
        details: phoneScore === 100 ? 'Phone number is properly formatted with international country code.' : 'Phone number formatting issues detected that prevent instant dial-in.',
        recommendations: phoneRecs,
      },
      intentQuality: {
        score: intentScore,
        status: intentStatus,
        details: prefilledCount > 0 ? `Prefilled text detected on ${prefilledCount} WhatsApp link(s).` : 'No prefilled message detected. Visitors must compose messages manually, lowering conversion velocity.',
        recommendations: intentRecs,
      },
      ctaQuality: {
        score: ctaScore,
        status: ctaStatus,
        details: ctaScore >= 90 ? 'Clear WhatsApp conversion action prompt present.' : 'CTA could be more prominent or specific.',
        recommendations: ctaRecs,
      },
      mobileUsability: {
        score: mobileScore,
        status: mobileStatus,
        details: mobileScore === 100 ? 'Uses standard wa.me universal deep links.' : 'Link format may cause issues on desktop or certain mobile browsers.',
        recommendations: mobileRecs,
      },
    },
    topRecommendations,
    analyzedUrls: page ? [page.url] : [],
  };
}
