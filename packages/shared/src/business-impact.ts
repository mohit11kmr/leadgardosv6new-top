import type { BusinessImpact, Finding, ImpactInputs, Severity } from './types.js';

// Explicit conversion risk mapping per severity level and category
const SEVERITY_CONVERSION_RISK: Record<Severity, number> = {
  CRITICAL: 0.15, // 15% estimated conversion risk (e.g. TLS broken, site unindexable)
  HIGH: 0.06,     // 6% estimated conversion risk (e.g. broken WhatsApp/tel CTA, noindex on landing page)
  MEDIUM: 0.02,   // 2% estimated conversion risk (e.g. missing CTA, mixed content, canonical error)
  LOW: 0.005,     // 0.5% estimated conversion risk (e.g. missing header, missing OG tag)
  INFO: 0.0,
};

const CATEGORY_WEIGHT: Record<string, number> = {
  LEAD: 1.0,        // Direct impact on lead conversion
  ADVERTISING: 0.8, // Attribution / audience capture risk
  SEO: 0.5,         // Organic discovery risk
  SECURITY: 0.7,    // Browser warning / user trust drop
};

export function calculateConversionRisk(findings: Finding[]): number {
  if (!findings.length) return 0;

  // Deduplicate finding impact by rule / issue type to avoid compound inflation
  const seenRules = new Set<string>();
  let totalRisk = 0;

  for (const finding of findings) {
    const key = finding.internalKey ?? `${finding.ruleId}_${finding.title}`;
    if (seenRules.has(key)) {
      // Small fractional addition for multiple occurrences across distinct pages
      totalRisk += (SEVERITY_CONVERSION_RISK[finding.severity] ?? 0.01) * 0.25;
      continue;
    }
    seenRules.add(key);

    const baseRisk = SEVERITY_CONVERSION_RISK[finding.severity] ?? 0.01;
    const catWeight = CATEGORY_WEIGHT[finding.category] ?? 0.7;
    totalRisk += baseRisk * catWeight;
  }

  // Cap estimated conversion risk conservatively at 45% (0.45)
  return Math.min(0.45, Math.round(totalRisk * 1000) / 1000);
}

export function buildBusinessImpact(findings: Finding[], rawInputs: Partial<ImpactInputs> = {}): BusinessImpact {
  const source: 'USER' | 'DEFAULT' = rawInputs.source ?? (rawInputs.monthlyVisitors && rawInputs.monthlyVisitors > 0 ? 'USER' : 'DEFAULT');
  const monthlyVisitors = rawInputs.monthlyVisitors ?? (source === 'USER' ? 5000 : 2500);
  const conversionRate = rawInputs.conversionRate ?? (source === 'USER' ? 2.5 : 2.0);
  const averageLeadValue = rawInputs.averageLeadValue ?? (source === 'USER' ? 500 : 250);

  const inputs = {
    monthlyVisitors,
    conversionRate,
    averageLeadValue,
    source,
  };

  const estimatedConversionRisk = calculateConversionRisk(findings);
  const baselineLeads = monthlyVisitors * (conversionRate / 100);
  const estimatedLostOpportunities = Math.round(baselineLeads * estimatedConversionRisk);
  const estimatedOpportunityLoss = Math.round(estimatedLostOpportunities * averageLeadValue);

  // Determine confidence rating
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (source === 'USER' && monthlyVisitors > 0 && averageLeadValue > 0) {
    confidence = 'HIGH';
  } else if (monthlyVisitors > 0 && averageLeadValue > 0) {
    confidence = 'MEDIUM';
  }

  return {
    kind: 'POTENTIAL_OPPORTUNITY_LOSS',
    confidence,
    inputs,
    estimatedConversionRisk,
    estimatedLostOpportunities,
    estimatedOpportunityLoss,
    currency: 'INR',
    methodology:
      'Potential Opportunity Loss = Monthly Visitors × (Baseline Conversion Rate %) × Estimated Conversion Risk × Average Lead Value. Conversion risk reflects technical failure points identified during diagnostic analysis. Outputs represent potential opportunity loss models rather than guaranteed losses.',
  };
}
