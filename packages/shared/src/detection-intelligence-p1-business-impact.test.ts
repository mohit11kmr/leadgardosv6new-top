import { describe, it, expect } from 'vitest';
import { calculateScores } from './scoring.js';
import { buildBusinessImpact, calculateConversionRisk } from './business-impact.js';
import type { Finding } from './types.js';

/**
 * Phase 6 (Business Impact Integration) evidence: proves the four new P1
 * detection-intelligence rule families (LG-040 structured data, LG-041
 * hreflang, LG-042/043 consent, LG-044 duplicate content) actually move
 * calculateScores/buildBusinessImpact's real output — not just that they're
 * theoretically compatible with the Finding shape. No new revenue-estimation
 * logic was written for these findings: they flow through the exact same
 * SCORE_RULES_V3 + business-impact severity/category weighting every other
 * scanner's findings already use.
 */

function baseFinding(overrides: Partial<Finding>): Finding {
  return {
    ruleId: 'LG-044',
    internalKey: 'DUPLICATE_CONTENT',
    normalizedIssueKey: 'DUPLICATE_CONTENT',
    category: 'SEO',
    scope: 'WEBSITE',
    severity: 'MEDIUM',
    title: 'Duplicate content',
    description: 'Test finding',
    evidence: { source: 'test', observed: 'test', location: 'https://example.test', why: 'test', recommendation: 'test' },
    recommendation: 'Fix it',
    scoreImpact: 3,
    ...overrides,
  };
}

describe('Detection Intelligence P1 → scoring integration', () => {
  it('a DUPLICATE_CONTENT finding measurably lowers the SEO pillar score relative to a clean audit', () => {
    const clean = calculateScores([], 'v3');
    const withFinding = calculateScores([baseFinding({})], 'v3');
    expect(withFinding.seo).toBeLessThan(clean.seo);
    expect(clean.seo).toBe(100);
  });

  it('a NO_CONSENT_MECHANISM_DETECTED finding lowers the SECURITY pillar score', () => {
    const finding = baseFinding({
      ruleId: 'LG-042',
      internalKey: 'NO_CONSENT_MECHANISM_DETECTED',
      normalizedIssueKey: 'NO_CONSENT_MECHANISM_DETECTED',
      category: 'SECURITY',
      severity: 'LOW',
      scoreImpact: 3,
    });
    const clean = calculateScores([], 'v3');
    const withFinding = calculateScores([finding], 'v3');
    expect(withFinding.security).toBeLessThan(clean.security);
  });

  it('a TRACKER_FIRED_BEFORE_CONSENT_GA4 finding lowers the SECURITY pillar score more than a LOW-severity one, reflecting its MEDIUM severity/higher defaultImpact', () => {
    const lowSeverity = calculateScores(
      [baseFinding({ ruleId: 'LG-042', internalKey: 'NO_CONSENT_MECHANISM_DETECTED', normalizedIssueKey: 'NO_CONSENT_MECHANISM_DETECTED', category: 'SECURITY', severity: 'LOW' })],
      'v3'
    );
    const correlationFinding = calculateScores(
      [baseFinding({ ruleId: 'LG-043', internalKey: 'TRACKER_FIRED_BEFORE_CONSENT_GA4', normalizedIssueKey: 'TRACKER_FIRED_BEFORE_CONSENT_GA4', category: 'SECURITY', severity: 'MEDIUM' })],
      'v3'
    );
    expect(correlationFinding.security).toBeLessThan(lowSeverity.security);
  });

  it('a STRUCTURED_DATA_MALFORMED finding (PAGE scope) scales with occurrence count via BOUNDED_PER_PAGE, capped at maxPenalty', () => {
    const onePage = calculateScores(
      [baseFinding({ ruleId: 'LG-040', internalKey: 'STRUCTURED_DATA_MALFORMED', normalizedIssueKey: 'STRUCTURED_DATA_MALFORMED', category: 'SEO', scope: 'PAGE', affectedUrl: 'https://example.test/a' })],
      'v3'
    );
    const fivePages = calculateScores(
      Array.from({ length: 5 }, (_, i) =>
        baseFinding({
          ruleId: 'LG-040',
          internalKey: 'STRUCTURED_DATA_MALFORMED',
          normalizedIssueKey: 'STRUCTURED_DATA_MALFORMED',
          category: 'SEO',
          scope: 'PAGE',
          affectedUrl: `https://example.test/page-${i}`,
        })
      ),
      'v3'
    );
    // More affected pages → lower (worse) score, but bounded — never below what maxPenalty=9 allows.
    expect(fivePages.seo).toBeLessThanOrEqual(onePage.seo);
    expect(fivePages.seo).toBeGreaterThanOrEqual(91); // 100 - maxPenalty(9)
  });
});

describe('Detection Intelligence P1 → business-impact (₹) integration', () => {
  it('a HREFLANG_MISSING_RECIPROCAL finding contributes to the estimated conversion risk and opportunity loss', () => {
    const finding = baseFinding({
      ruleId: 'LG-041',
      internalKey: 'HREFLANG_MISSING_RECIPROCAL',
      normalizedIssueKey: 'HREFLANG_MISSING_RECIPROCAL',
      category: 'SEO',
      severity: 'MEDIUM',
    });

    const riskWithFinding = calculateConversionRisk([finding]);
    const riskClean = calculateConversionRisk([]);
    expect(riskWithFinding).toBeGreaterThan(riskClean);
    expect(riskClean).toBe(0);

    const impact = buildBusinessImpact([finding], { monthlyVisitors: 10_000, conversionRate: 2, averageLeadValue: 500, source: 'USER' });
    expect(impact.estimatedOpportunityLoss).toBeGreaterThan(0);
    // Methodology/assumptions remain the existing, transparent ones — no
    // new fabricated-revenue logic was introduced for this finding type.
    expect(impact.methodology).toContain('Potential Opportunity Loss');
    expect(impact.confidence).toBe('HIGH'); // USER-sourced inputs, matching the pre-existing confidence model
  });

  it('does not fabricate impact for a finding with no reliable model — SECURITY category still uses the existing conservative weight, not an invented one', () => {
    const finding = baseFinding({
      ruleId: 'LG-042',
      internalKey: 'NO_CONSENT_MECHANISM_DETECTED',
      normalizedIssueKey: 'NO_CONSENT_MECHANISM_DETECTED',
      category: 'SECURITY',
      severity: 'LOW',
    });
    const impact = buildBusinessImpact([finding]);
    // Uses the pre-existing SECURITY category weight (0.7) and LOW severity
    // risk (0.005) from business-impact.ts, rounded to 3dp by
    // calculateConversionRisk's existing (unmodified) rounding — this test
    // would fail if new, unreviewed weighting logic had been added
    // specifically for this finding type instead of reusing the existing
    // model.
    expect(impact.estimatedConversionRisk).toBeCloseTo(0.003, 3);
  });
});
