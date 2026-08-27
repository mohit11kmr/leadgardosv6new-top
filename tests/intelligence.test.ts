import { describe, it, expect } from 'vitest';
import {
  buildRevenueScenarios,
  simulateFunnelLeakage,
  analyzeWhatsAppOptimization,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';

describe('Intelligence Domain: Revenue Scenarios, Funnel & WhatsApp Optimizer (Requirements 10, 13, 14, 15, 16)', () => {
  const sampleFindings: Finding[] = [
    {
      ruleId: 'LG-001',
      internalKey: 'WHATSAPP_LEADING_ZERO',
      normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
      category: 'LEAD',
      scope: 'PAGE',
      severity: 'HIGH',
      title: 'WhatsApp leading zero prefix',
      description: 'desc',
      affectedUrl: 'https://example.com/',
      evidence: { source: 'href', observed: 'wa.me/0919876543210', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'Fix WA number',
      scoreImpact: 18,
    },
    {
      ruleId: 'LG-010',
      internalKey: 'NOINDEX_BLOCKING',
      normalizedIssueKey: 'NOINDEX_BLOCKING',
      category: 'SEO',
      scope: 'PAGE',
      severity: 'HIGH',
      title: 'Noindex directive present on landing page',
      description: 'desc',
      affectedUrl: 'https://example.com/',
      evidence: { source: 'meta', observed: 'noindex', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'Remove noindex',
      scoreImpact: 20,
    },
    {
      ruleId: 'LG-014',
      internalKey: 'SEC_HEADER_CSP',
      normalizedIssueKey: 'SEC_HEADER_CSP',
      category: 'SECURITY',
      scope: 'WEBSITE',
      severity: 'MEDIUM',
      title: 'CSP header missing',
      description: 'desc',
      affectedUrl: 'https://example.com/',
      evidence: { source: 'header', observed: 'none', location: 'loc', why: 'why', recommendation: 'rec' },
      recommendation: 'Add CSP',
      scoreImpact: 5,
    },
  ];

  it('calculates deterministic revenue recovery scenarios (Current vs Conservative vs Target)', () => {
    const res = buildRevenueScenarios(sampleFindings, {
      monthlyVisitors: 10000,
      conversionRate: 3.0,
      averageLeadValue: 1000,
      source: 'USER',
    });

    expect(res.scenarios).toHaveLength(3);
    const [current, conservative, target] = res.scenarios;

    expect(current?.slug).toBe('current');
    expect(conservative?.slug).toBe('conservative');
    expect(target?.slug).toBe('target');

    // Baseline leads = 10000 * 3% = 300 leads -> ₹300,000 value
    expect(target?.estimatedMonthlyLeads).toBe(300);
    expect(target?.estimatedMonthlyValue).toBe(300_000);

    // Current leads must be reduced by conversion risk
    expect(current?.estimatedMonthlyLeads).toBeLessThan(300);
    expect(current?.recoveredLeadsPerMonth).toBe(0);

    // Conservative recovery must recover positive leads and revenue
    expect(conservative?.recoveredLeadsPerMonth).toBeGreaterThan(0);
    expect(conservative?.recoveredValuePerMonth).toBeGreaterThan(0);
    expect(conservative?.estimatedMonthlyValue).toBeGreaterThan(current!.estimatedMonthlyValue);

    // Target recovery must achieve full potential
    expect(target?.recoveredValuePerMonth).toBeGreaterThan(conservative!.recoveredValuePerMonth);
  });

  it('simulates funnel leakage across 5 pipeline stages mapping technical friction points', () => {
    const funnel = simulateFunnelLeakage(sampleFindings, {
      monthlyVisitors: 5000,
      conversionRate: 2.0,
    });

    expect(funnel.stages).toHaveLength(5);
    expect(funnel.stages[0]?.stage).toBe('TRAFFIC');
    expect(funnel.stages[1]?.stage).toBe('LANDING');
    expect(funnel.stages[2]?.stage).toBe('ENGAGEMENT');
    expect(funnel.stages[3]?.stage).toBe('CONTACT_INTENT');
    expect(funnel.stages[4]?.stage).toBe('LEAD_CONVERSION');

    // Check that SEO issue is mapped to Landing stage
    expect(funnel.stages[1]?.technicalFrictionPoints.some((p) => p.includes('Noindex'))).toBe(true);

    // Check that Security issue is mapped to Engagement stage
    expect(funnel.stages[2]?.technicalFrictionPoints.some((p) => p.includes('CSP'))).toBe(true);

    // Check that WhatsApp issue is mapped to Lead Conversion stage
    expect(funnel.stages[4]?.technicalFrictionPoints.some((p) => p.includes('WhatsApp'))).toBe(true);

    expect(funnel.estimatedActualLeads).toBeGreaterThan(0);
    expect(funnel.totalLeakedVisitors).toBe(5000 - funnel.estimatedActualLeads);
  });

  it('evaluates Zero-Intent WhatsApp Optimizer (LG-002) quality dimensions and recommendations', () => {
    const pageWithIssues: PageRecord = {
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      statusCode: 200,
      contentType: 'text/html',
      headers: {},
      htmlAvailable: true,
      responseTimeMs: 20,
      depth: 0,
      redirectChain: [],
      html: `
        <html>
          <body>
            <!-- Leading zero and missing prefilled text -->
            <a href="https://wa.me/09876543210">WhatsApp</a>
          </body>
        </html>
      `,
    };

    const report = analyzeWhatsAppOptimization(pageWithIssues, [
      {
        ruleId: 'LG-001',
        internalKey: 'WHATSAPP_LEADING_ZERO',
        normalizedIssueKey: 'WHATSAPP_LEADING_ZERO',
        category: 'LEAD',
        scope: 'PAGE',
        severity: 'HIGH',
        title: 'WhatsApp leading zero prefix',
        description: 'desc',
        affectedUrl: 'https://example.com/',
        evidence: { source: 'href', observed: 'wa.me/09876543210', location: 'loc', why: 'why', recommendation: 'rec' },
        recommendation: 'Fix WA',
        scoreImpact: 18,
      },
    ]);

    expect(report.hasWhatsAppCta).toBe(true);
    expect(report.detectedLinksCount).toBe(1);
    expect(report.dimensions.phoneQuality.score).toBeLessThan(50); // Leading zero penalty
    expect(report.dimensions.intentQuality.score).toBeLessThan(50); // Missing prefilled text
    expect(report.topRecommendations.length).toBeGreaterThan(0);
  });
});
