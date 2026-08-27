import type { Finding, FindingCategory, ScoreBreakdown, ScoreRule } from './types.js';

export const SCORE_RULES_V2: Record<string, ScoreRule> = {
  'WHATSAPP_MALFORMED': {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_MALFORMED',
    category: 'LEAD',
    defaultImpact: 18,
    severity: 'HIGH',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 36,
  },
  'WHATSAPP_MISSING': {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_MISSING',
    category: 'LEAD',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 8,
  },
  'CONTACT_FORM_MISSING': {
    ruleId: 'LG-001',
    internalKey: 'CONTACT_FORM_MISSING',
    category: 'LEAD',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 8,
  },
  'CTA_MISSING': {
    ruleId: 'LG-001',
    internalKey: 'CTA_MISSING',
    category: 'LEAD',
    defaultImpact: 6,
    severity: 'MEDIUM',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 6,
  },
  'TEL_MALFORMED': {
    ruleId: 'LG-003',
    internalKey: 'TEL_MALFORMED',
    category: 'LEAD',
    defaultImpact: 12,
    severity: 'HIGH',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 24,
  },
  'TEL_NON_NORMALIZED': {
    ruleId: 'LG-003',
    internalKey: 'TEL_NON_NORMALIZED',
    category: 'LEAD',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 6,
  },
  'TEL_MISSING': {
    ruleId: 'LG-003',
    internalKey: 'TEL_MISSING',
    category: 'LEAD',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
  'META_PIXEL_MISSING': {
    ruleId: 'LG-006',
    internalKey: 'META_PIXEL_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 4,
  },
  'GA4_MISSING': {
    ruleId: 'LG-007',
    internalKey: 'GA4_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 4,
  },
  'GTM_MISSING': {
    ruleId: 'LG-007',
    internalKey: 'GTM_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 4,
  },
  'NOINDEX_PAGE': {
    ruleId: 'LG-010',
    internalKey: 'NOINDEX_PAGE',
    category: 'SEO',
    defaultImpact: 18,
    severity: 'HIGH',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 36,
  },
  'CANONICAL_MISSING': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_MISSING',
    category: 'SEO',
    defaultImpact: 6,
    severity: 'MEDIUM',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 18,
  },
  'CANONICAL_DUPLICATE': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_DUPLICATE',
    category: 'SEO',
    defaultImpact: 6,
    severity: 'MEDIUM',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 18,
  },
  'CANONICAL_CROSS_ORIGIN': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_CROSS_ORIGIN',
    category: 'SEO',
    defaultImpact: 10,
    severity: 'HIGH',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 20,
  },
  'CANONICAL_MALFORMED': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_MALFORMED',
    category: 'SEO',
    defaultImpact: 8,
    severity: 'HIGH',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 16,
  },
  'CANONICAL_RELATIVE': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_RELATIVE',
    category: 'SEO',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 9,
  },
  'CANONICAL_FRAGMENT': {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_FRAGMENT',
    category: 'SEO',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 9,
  },
  'OPENGRAPH_MISSING': {
    ruleId: 'LG-012',
    internalKey: 'OPENGRAPH_MISSING',
    category: 'SEO',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 10,
  },
  'OPENGRAPH_MALFORMED': {
    ruleId: 'LG-012',
    internalKey: 'OPENGRAPH_MALFORMED',
    category: 'SEO',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 10,
  },
  'MIXED_CONTENT': {
    ruleId: 'LG-013',
    internalKey: 'MIXED_CONTENT',
    category: 'SECURITY',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'PAGE_BOUNDED',
    maxPenalty: 24,
  },
  'TLS_ERROR': {
    ruleId: 'LG-013',
    internalKey: 'TLS_ERROR',
    category: 'SECURITY',
    defaultImpact: 30,
    severity: 'CRITICAL',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 30,
  },
  'SEC_HEADER_CSP': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_CSP',
    category: 'SECURITY',
    defaultImpact: 5,
    severity: 'MEDIUM',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 5,
  },
  'SEC_HEADER_HSTS': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_HSTS',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
  'SEC_HEADER_X_FRAME': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_X_FRAME',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
  'SEC_HEADER_X_CONTENT_TYPE': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_X_CONTENT_TYPE',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
  'SEC_HEADER_REFERRER': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_REFERRER',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
  'SEC_HEADER_PERMISSIONS': {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_PERMISSIONS',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'SITE_ONCE',
    maxPenalty: 3,
  },
};

export function calculateScores(findings: Finding[], version = 'v2'): ScoreBreakdown {
  if (version === 'v1') {
    const v1Scores = { lead: 100, advertising: 100, seo: 100, security: 100 };
    for (const finding of findings) {
      const category = finding.category.toLowerCase() as keyof typeof v1Scores;
      if (category in v1Scores) {
        v1Scores[category] = Math.max(0, v1Scores[category] - Math.max(0, finding.scoreImpact));
      }
    }
    return {
      ...v1Scores,
      overall: Math.round((v1Scores.lead + v1Scores.advertising + v1Scores.seo + v1Scores.security) / 4),
    };
  }

  // Version 2 scoring with finding deduplication and bounded page penalties
  const deductions: Record<FindingCategory, number> = {
    LEAD: 0,
    ADVERTISING: 0,
    SEO: 0,
    SECURITY: 0,
  };

  // Group findings by rule key / issue identifier
  const grouped = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = finding.internalKey ?? `${finding.ruleId}_${finding.title}`;
    const list = grouped.get(key) ?? [];
    list.push(finding);
    grouped.set(key, list);
  }

  for (const [key, groupFindings] of grouped.entries()) {
    const first = groupFindings[0]!;
    const category = first.category;
    const ruleConfig = SCORE_RULES_V2[key] ?? {
      ruleId: first.ruleId,
      category,
      defaultImpact: first.scoreImpact,
      severity: first.severity,
      aggregationPolicy: first.scope === 'PAGE' ? 'PAGE_BOUNDED' : 'SITE_ONCE',
      maxPenalty: first.scoreImpact * (first.scope === 'PAGE' ? 2 : 1),
    };

    let penalty = 0;
    if (ruleConfig.aggregationPolicy === 'SITE_ONCE' || first.scope === 'WEBSITE' || first.scope === 'AUDIT') {
      // Applied at most once across the whole website
      penalty = Math.min(ruleConfig.maxPenalty ?? ruleConfig.defaultImpact, Math.max(...groupFindings.map((f) => f.scoreImpact)));
    } else if (ruleConfig.aggregationPolicy === 'PAGE_BOUNDED') {
      // Distinct affected URLs contribute, up to maxPenalty
      const distinctUrls = new Set(groupFindings.map((f) => f.affectedUrl ?? 'default'));
      const sum = [...distinctUrls].reduce((acc) => acc + ruleConfig.defaultImpact, 0);
      penalty = Math.min(ruleConfig.maxPenalty ?? ruleConfig.defaultImpact * 2, sum);
    } else {
      // PAGE_SUM: sum each distinct instance
      penalty = groupFindings.reduce((sum, f) => sum + f.scoreImpact, 0);
    }

    deductions[category] = (deductions[category] ?? 0) + penalty;
  }

  const lead = Math.max(0, Math.min(100, 100 - deductions.LEAD));
  const advertising = Math.max(0, Math.min(100, 100 - deductions.ADVERTISING));
  const seo = Math.max(0, Math.min(100, 100 - deductions.SEO));
  const security = Math.max(0, Math.min(100, 100 - deductions.SECURITY));
  const overall = Math.round((lead + advertising + seo + security) / 4);

  return { lead, advertising, seo, security, overall };
}
