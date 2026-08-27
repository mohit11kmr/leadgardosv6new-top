import { describe, it, expect } from 'vitest';
import {
  calculateScores,
  explainScores,
  type Finding,
} from '@leadguard/shared';

describe('Scoring Engine V3 & Rule Explanation (Requirements 15, 16, 17, 18)', () => {
  it('deduplicates website-level issues so 10 pages do not receive 10x penalty', () => {
    const findings: Finding[] = Array.from({ length: 10 }, (_, i) => ({
      ruleId: 'LG-014',
      internalKey: 'SEC_HEADER_CSP',
      normalizedIssueKey: 'SEC_HEADER_CSP',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'Content-Security-Policy header missing',
      description: 'Missing CSP header',
      affectedUrl: `https://example.com/page-${i + 1}`,
      evidence: { source: 'header', observed: 'none', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'Add CSP',
      scoreImpact: 5,
    }));

    const explanation = explainScores(findings, 'v3');
    // Security score starts at 100, deducts baseImpact of 5 once -> 95 (NOT 50!)
    expect(explanation.security.score).toBe(95);
    expect(explanation.security.deductions).toHaveLength(1);
    expect(explanation.security.deductions[0]?.penalty).toBe(5);
    expect(explanation.security.deductions[0]?.policy).toBe('ONCE_PER_WEBSITE');
  });

  it('bounds page-level issue penalties reasonably across multiple pages', () => {
    // 5 pages with malformed WhatsApp link (rule defaultImpact = 18, maxPenalty = 36)
    const findings: Finding[] = Array.from({ length: 5 }, (_, i) => ({
      ruleId: 'LG-001',
      internalKey: 'WHATSAPP_LEADING_ZERO',
      normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
      category: 'LEAD',
      scope: 'PAGE',
      severity: 'HIGH',
      title: 'WhatsApp leading zero prefix',
      description: 'desc',
      affectedUrl: `https://example.com/contact-${i + 1}`,
      evidence: { source: 'href', observed: 'wa.me/091...', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'Fix WA',
      scoreImpact: 18,
    }));

    const scores = calculateScores(findings, 'v3');
    // Lead score starts at 100, capped at maxPenalty = 36 -> 100 - 36 = 64
    expect(scores.lead).toBe(64);
  });

  it('strictly isolates pillars so an issue in one category cannot affect another pillar score', () => {
    const leadOnlyFinding: Finding[] = [
      {
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_MALFORMED',
        normalizedIssueKey: 'WHATSAPP_MALFORMED',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'Malformed WhatsApp',
        description: 'desc',
        evidence: { source: 'href', observed: 'obs', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'rec',
        scoreImpact: 18,
      },
    ];

    const scores = calculateScores(leadOnlyFinding, 'v3');
    expect(scores.lead).toBeLessThan(100);
    // Advertising, SEO, and Security pillars must remain completely unaffected at 100!
    expect(scores.advertising).toBe(100);
    expect(scores.seo).toBe(100);
    expect(scores.security).toBe(100);
  });

  it('exposes transparent score reasoning with deductions and topRules for every pillar', () => {
    const findings: Finding[] = [
      {
        ruleId: 'LG-010',
        internalKey: 'NOINDEX_BLOCKING',
        normalizedIssueKey: 'NOINDEX_BLOCKING',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'Search crawler noindex directive present',
        description: 'desc',
        affectedUrl: 'https://example.com/pricing',
        evidence: { source: 'meta', observed: 'noindex', location: 'pricing', why: 'why', recommendation: 'rec' },
        recommendation: 'Remove noindex',
        scoreImpact: 20,
      },
      {
        ruleId: 'LG-011',
        internalKey: 'CANONICAL_MISSING',
        normalizedIssueKey: 'CANONICAL_MISSING',
        category: 'SEO',
        scope: 'PAGE',
        severity: 'LOW',
        title: 'Canonical tag missing',
        description: 'desc',
        affectedUrl: 'https://example.com/pricing',
        evidence: { source: 'head', observed: 'none', location: 'pricing', why: 'why', recommendation: 'rec' },
        recommendation: 'Add canonical',
        scoreImpact: 5,
      },
    ];

    const explanation = explainScores(findings, 'v3');
    expect(explanation.seo.score).toBe(75); // 100 - (20 + 5) = 75
    expect(explanation.seo.deductions).toHaveLength(2);
    expect(explanation.seo.topRules[0]).toContain('NOINDEX_BLOCKING (-20)');
    expect(explanation.seo.topRules[1]).toContain('CANONICAL_MISSING (-5)');
  });

  it('supports versioned score calculation (v1 legacy vs v3 rule-driven)', () => {
    const tenFindings: Finding[] = Array.from({ length: 10 }, (_, i) => ({
      ruleId: 'LG-014',
      internalKey: 'SEC_HEADER_CSP',
      normalizedIssueKey: 'SEC_HEADER_CSP',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'CSP missing',
      description: 'desc',
      affectedUrl: `https://example.com/p-${i}`,
      evidence: { source: 'header', observed: 'none', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'rec',
      scoreImpact: 5,
    }));

    // v1 legacy: 10 * 5 = 50 deduction -> security score = 50
    const v1Scores = calculateScores(tenFindings, 'v1');
    expect(v1Scores.security).toBe(50);

    // v3 rule engine: deduplicated via ONCE_PER_WEBSITE policy -> security score = 95
    const v3Scores = calculateScores(tenFindings, 'v3');
    expect(v3Scores.security).toBe(95);
  });
});
