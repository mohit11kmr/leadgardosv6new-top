import type {
  Finding,
  FindingCategory,
  PillarScoreExplanation,
  ScoreBreakdown,
  ScoreDeduction,
  ScoreExplanation,
  ScoreRule,
} from './types.js';

export const SCORE_RULES_V3: Record<string, ScoreRule> = {
  // Lead Pillar (LG-001 to LG-005)
  WHATSAPP_MALFORMED: {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_MALFORMED',
    normalizedIssueKey: 'WHATSAPP_MALFORMED',
    category: 'LEAD',
    defaultImpact: 18,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 36,
    enabled: true,
    version: 'v3',
  },
  WHATSAPP_LEADING_ZERO: {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_LEADING_ZERO',
    normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
    category: 'LEAD',
    defaultImpact: 18,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 36,
    enabled: true,
    version: 'v3',
  },
  WHATSAPP_DUPLICATE_COUNTRY_CODE: {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_DUPLICATE_COUNTRY_CODE',
    normalizedIssueKey: 'WHATSAPP_DUPLICATE_COUNTRY_CODE',
    category: 'LEAD',
    defaultImpact: 18,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 36,
    enabled: true,
    version: 'v3',
  },
  WHATSAPP_MISSING: {
    ruleId: 'LG-001',
    internalKey: 'WHATSAPP_MISSING',
    normalizedIssueKey: 'WHATSAPP_MISSING',
    category: 'LEAD',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 8,
    enabled: true,
    version: 'v3',
  },
  TEL_MALFORMED: {
    ruleId: 'LG-003',
    internalKey: 'TEL_MALFORMED',
    normalizedIssueKey: 'TEL_MALFORMED',
    category: 'LEAD',
    defaultImpact: 15,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 30,
    enabled: true,
    version: 'v3',
  },
  TEL_NON_NORMALIZED: {
    ruleId: 'LG-003',
    internalKey: 'TEL_NON_NORMALIZED',
    normalizedIssueKey: 'TEL_NON_NORMALIZED',
    category: 'LEAD',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 6,
    enabled: true,
    version: 'v3',
  },
  TEL_MISSING: {
    ruleId: 'LG-003',
    internalKey: 'TEL_MISSING',
    normalizedIssueKey: 'TEL_MISSING',
    category: 'LEAD',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 3,
    enabled: true,
    version: 'v3',
  },
  CONTACT_FORM_MISSING: {
    ruleId: 'LG-001',
    internalKey: 'CONTACT_FORM_MISSING',
    normalizedIssueKey: 'CONTACT_FORM_MISSING',
    category: 'LEAD',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 8,
    enabled: true,
    version: 'v3',
  },
  CTA_MISSING: {
    ruleId: 'LG-001',
    internalKey: 'CTA_MISSING',
    normalizedIssueKey: 'CTA_MISSING',
    category: 'LEAD',
    defaultImpact: 6,
    severity: 'MEDIUM',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 6,
    enabled: true,
    version: 'v3',
  },

  // Advertising Pillar (LG-006 to LG-009)
  META_PIXEL_MISSING: {
    ruleId: 'LG-006',
    internalKey: 'META_PIXEL_MISSING',
    normalizedIssueKey: 'META_PIXEL_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 4,
    enabled: true,
    version: 'v3',
  },
  GA4_MISSING: {
    ruleId: 'LG-007',
    internalKey: 'GA4_MISSING',
    normalizedIssueKey: 'GA4_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 4,
    enabled: true,
    version: 'v3',
  },
  GTM_MISSING: {
    ruleId: 'LG-007',
    internalKey: 'GTM_MISSING',
    normalizedIssueKey: 'GTM_MISSING',
    category: 'ADVERTISING',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 4,
    enabled: true,
    version: 'v3',
  },

  // SEO Pillar (LG-010 to LG-012)
  NOINDEX_BLOCKING: {
    ruleId: 'LG-010',
    internalKey: 'NOINDEX_BLOCKING',
    normalizedIssueKey: 'NOINDEX_BLOCKING',
    category: 'SEO',
    defaultImpact: 20,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 40,
    enabled: true,
    version: 'v3',
  },
  CANONICAL_MISSING: {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_MISSING',
    normalizedIssueKey: 'CANONICAL_MISSING',
    category: 'SEO',
    defaultImpact: 5,
    severity: 'LOW',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 15,
    enabled: true,
    version: 'v3',
  },
  CANONICAL_DUPLICATE: {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_DUPLICATE',
    normalizedIssueKey: 'CANONICAL_DUPLICATE',
    category: 'SEO',
    defaultImpact: 8,
    severity: 'MEDIUM',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 24,
    enabled: true,
    version: 'v3',
  },
  CANONICAL_CROSS_ORIGIN: {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_CROSS_ORIGIN',
    normalizedIssueKey: 'CANONICAL_CROSS_ORIGIN',
    category: 'SEO',
    defaultImpact: 15,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 30,
    enabled: true,
    version: 'v3',
  },
  CANONICAL_RELATIVE: {
    ruleId: 'LG-011',
    internalKey: 'CANONICAL_RELATIVE',
    normalizedIssueKey: 'CANONICAL_RELATIVE',
    category: 'SEO',
    defaultImpact: 6,
    severity: 'LOW',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 18,
    enabled: true,
    version: 'v3',
  },
  OPENGRAPH_MISSING: {
    ruleId: 'LG-012',
    internalKey: 'OPENGRAPH_MISSING',
    normalizedIssueKey: 'OPENGRAPH_MISSING',
    category: 'SEO',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 8,
    enabled: true,
    version: 'v3',
  },

  // Security Pillar (LG-013 to LG-015)
  TLS_ERROR: {
    ruleId: 'LG-013',
    internalKey: 'TLS_ERROR',
    normalizedIssueKey: 'TLS_ERROR',
    category: 'SECURITY',
    defaultImpact: 30,
    severity: 'CRITICAL',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 30,
    enabled: true,
    version: 'v3',
  },
  MIXED_CONTENT_ACTIVE: {
    ruleId: 'LG-013',
    internalKey: 'MIXED_CONTENT_ACTIVE',
    normalizedIssueKey: 'MIXED_CONTENT_ACTIVE',
    category: 'SECURITY',
    defaultImpact: 15,
    severity: 'HIGH',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 30,
    enabled: true,
    version: 'v3',
  },
  MIXED_CONTENT_PASSIVE: {
    ruleId: 'LG-013',
    internalKey: 'MIXED_CONTENT_PASSIVE',
    normalizedIssueKey: 'MIXED_CONTENT_PASSIVE',
    category: 'SECURITY',
    defaultImpact: 5,
    severity: 'MEDIUM',
    aggregationPolicy: 'BOUNDED_PER_PAGE',
    maxPenalty: 15,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_CSP: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_CSP',
    normalizedIssueKey: 'SEC_HEADER_CSP',
    category: 'SECURITY',
    defaultImpact: 5,
    severity: 'MEDIUM',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 5,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_HSTS: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_HSTS',
    normalizedIssueKey: 'SEC_HEADER_HSTS',
    category: 'SECURITY',
    defaultImpact: 4,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 4,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_XFO: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_XFO',
    normalizedIssueKey: 'SEC_HEADER_XFO',
    category: 'SECURITY',
    defaultImpact: 3,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 3,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_XCTO: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_XCTO',
    normalizedIssueKey: 'SEC_HEADER_XCTO',
    category: 'SECURITY',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 2,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_RP: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_RP',
    normalizedIssueKey: 'SEC_HEADER_RP',
    category: 'SECURITY',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 2,
    enabled: true,
    version: 'v3',
  },
  SEC_HEADER_PP: {
    ruleId: 'LG-014',
    internalKey: 'SEC_HEADER_PP',
    normalizedIssueKey: 'SEC_HEADER_PP',
    category: 'SECURITY',
    defaultImpact: 2,
    severity: 'LOW',
    aggregationPolicy: 'ONCE_PER_WEBSITE',
    maxPenalty: 2,
    enabled: true,
    version: 'v3',
  },
};

export const SCORE_RULES_V2 = SCORE_RULES_V3;

function findRule(finding: Finding, rules = SCORE_RULES_V3): ScoreRule | undefined {
  const key = finding.normalizedIssueKey || finding.internalKey;
  if (key && rules[key]) return rules[key];
  return Object.values(rules).find((r) => r.ruleId === finding.ruleId && r.category === finding.category);
}

export function explainScores(findings: Finding[], version = 'v3'): ScoreExplanation {
  const rules = SCORE_RULES_V3;

  // Group findings by issue key and category
  const groups = new Map<string, { rule?: ScoreRule; findings: Finding[]; category: FindingCategory }>();

  for (const finding of findings) {
    const rule = findRule(finding, rules);
    const groupKey = rule?.internalKey ?? finding.internalKey ?? finding.ruleId ?? finding.title;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { rule, findings: [], category: finding.category });
    }
    groups.get(groupKey)!.findings.push(finding);
  }

  const deductionsByCategory: Record<FindingCategory, ScoreDeduction[]> = {
    LEAD: [],
    ADVERTISING: [],
    SEO: [],
    SECURITY: [],
  };

  for (const [groupKey, { rule, findings: groupFindings, category }] of groups.entries()) {
    const first = groupFindings[0]!;
    const distinctUrls = new Set(groupFindings.map((f) => f.affectedUrl).filter(Boolean));
    const occurrences = Math.max(1, distinctUrls.size || groupFindings.length);

    let penalty = 0;
    const baseImpact = rule?.defaultImpact ?? first.scoreImpact ?? 5;
    const policy = rule?.aggregationPolicy ?? (first.scope === 'WEBSITE' ? 'ONCE_PER_WEBSITE' : 'BOUNDED_PER_PAGE');

    if (policy === 'ONCE_PER_WEBSITE' || policy === 'ONCE_PER_AUDIT' || policy === 'SITE_ONCE') {
      penalty = baseImpact;
    } else if (policy === 'BOUNDED_PER_PAGE' || policy === 'PAGE_BOUNDED') {
      const maxPenalty = rule?.maxPenalty ?? baseImpact * 2;
      penalty = Math.min(maxPenalty, occurrences * baseImpact);
    } else {
      // PER_PAGE / PAGE_SUM
      penalty = occurrences * baseImpact;
    }

    const deduction: ScoreDeduction = {
      ruleId: first.ruleId,
      internalKey: first.internalKey ?? rule?.internalKey,
      normalizedIssueKey: first.normalizedIssueKey ?? rule?.normalizedIssueKey ?? groupKey,
      category,
      scope: first.scope,
      penalty,
      occurrences,
      policy,
      reason: first.title,
    };

    deductionsByCategory[category].push(deduction);
  }

  const buildPillarExplanation = (category: FindingCategory): PillarScoreExplanation => {
    const deductions = deductionsByCategory[category];
    const totalDeduction = deductions.reduce((sum, d) => sum + d.penalty, 0);
    const score = Math.max(0, Math.min(100, 100 - totalDeduction));
    const sorted = [...deductions].sort((a, b) => b.penalty - a.penalty);
    const topRules = sorted.slice(0, 3).map((d) => `${d.normalizedIssueKey || d.ruleId} (-${d.penalty})`);
    return { score, deductions: sorted, topRules };
  };

  const leadExp = buildPillarExplanation('LEAD');
  const advExp = buildPillarExplanation('ADVERTISING');
  const seoExp = buildPillarExplanation('SEO');
  const secExp = buildPillarExplanation('SECURITY');

  const overall = Math.round(leadExp.score * 0.35 + advExp.score * 0.15 + seoExp.score * 0.25 + secExp.score * 0.25);

  return {
    version,
    overall,
    lead: leadExp,
    advertising: advExp,
    seo: seoExp,
    security: secExp,
  };
}

export function calculateScores(findings: Finding[], version = 'v3'): ScoreBreakdown {
  if (version === 'v1') {
    // Legacy V1 calculation
    const base = { lead: 100, advertising: 100, seo: 100, security: 100, overall: 100 };
    for (const f of findings) {
      if (f.category === 'LEAD') base.lead -= f.scoreImpact;
      if (f.category === 'ADVERTISING') base.advertising -= f.scoreImpact;
      if (f.category === 'SEO') base.seo -= f.scoreImpact;
      if (f.category === 'SECURITY') base.security -= f.scoreImpact;
    }
    base.lead = Math.max(0, Math.min(100, base.lead));
    base.advertising = Math.max(0, Math.min(100, base.advertising));
    base.seo = Math.max(0, Math.min(100, base.seo));
    base.security = Math.max(0, Math.min(100, base.security));
    base.overall = Math.round(base.lead * 0.35 + base.advertising * 0.15 + base.seo * 0.25 + base.security * 0.25);
    return base;
  }

  const explanation = explainScores(findings, version);
  return {
    lead: explanation.lead.score,
    advertising: explanation.advertising.score,
    seo: explanation.seo.score,
    security: explanation.security.score,
    overall: explanation.overall,
  };
}
