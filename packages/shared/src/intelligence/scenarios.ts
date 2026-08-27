import { calculateConversionRisk } from '../business-impact.js';
import type { Finding, ImpactInputs } from '../types.js';

export interface RevenueScenario {
  slug: 'current' | 'conservative' | 'target';
  name: string;
  description: string;
  conversionRate: number;
  estimatedMonthlyLeads: number;
  estimatedMonthlyValue: number;
  recoveredLeadsPerMonth: number;
  recoveredValuePerMonth: number;
  changeVsCurrentPercent: number;
  assumptions: string[];
}

export interface RevenueScenariosResult {
  currency: string;
  inputs: {
    monthlyVisitors: number;
    baselineConversionRate: number;
    averageLeadValue: number;
    source: 'USER' | 'DEFAULT';
  };
  observedConversionRisk: number;
  scenarios: RevenueScenario[];
}

export function buildRevenueScenarios(
  findings: Finding[],
  rawInputs: Partial<ImpactInputs> = {}
): RevenueScenariosResult {
  const source: 'USER' | 'DEFAULT' =
    rawInputs.source ?? (rawInputs.monthlyVisitors && rawInputs.monthlyVisitors > 0 ? 'USER' : 'DEFAULT');
  const monthlyVisitors = rawInputs.monthlyVisitors ?? (source === 'USER' ? 5000 : 2500);
  const baselineRate = rawInputs.conversionRate ?? (source === 'USER' ? 2.5 : 2.0);
  const averageLeadValue = rawInputs.averageLeadValue ?? (source === 'USER' ? 500 : 250);

  const observedConversionRisk = calculateConversionRisk(findings);

  // 1. Current state: baseline conversion rate penalized by observed conversion risk
  const currentEffectiveRate = Math.max(0.1, Math.round(baselineRate * (1 - observedConversionRisk) * 100) / 100);
  const currentLeads = Math.round(monthlyVisitors * (currentEffectiveRate / 100));
  const currentValue = Math.round(currentLeads * averageLeadValue);

  // 2. Conservative Recovery: assumes fixing primary high-impact issues (50% risk recovery)
  const conservativeRisk = observedConversionRisk * 0.5;
  const conservativeRate = Math.max(0.1, Math.round(baselineRate * (1 - conservativeRisk) * 100) / 100);
  const conservativeLeads = Math.round(monthlyVisitors * (conservativeRate / 100));
  const conservativeValue = Math.round(conservativeLeads * averageLeadValue);
  const conservativeRecoveredLeads = Math.max(0, conservativeLeads - currentLeads);
  const conservativeRecoveredValue = Math.max(0, conservativeValue - currentValue);
  const conservativeChangePct =
    currentValue > 0 ? Math.round(((conservativeValue - currentValue) / currentValue) * 100) : 0;

  // 3. Target Recovery: full remediation of detected technical friction (100% risk recovery to baseline)
  const targetRate = baselineRate;
  const targetLeads = Math.round(monthlyVisitors * (targetRate / 100));
  const targetValue = Math.round(targetLeads * averageLeadValue);
  const targetRecoveredLeads = Math.max(0, targetLeads - currentLeads);
  const targetRecoveredValue = Math.max(0, targetValue - currentValue);
  const targetChangePct = currentValue > 0 ? Math.round(((targetValue - currentValue) / currentValue) * 100) : 0;

  const scenarios: RevenueScenario[] = [
    {
      slug: 'current',
      name: 'Current Reality',
      description: 'Projected monthly performance under current technical friction and conversion drop-offs.',
      conversionRate: currentEffectiveRate,
      estimatedMonthlyLeads: currentLeads,
      estimatedMonthlyValue: currentValue,
      recoveredLeadsPerMonth: 0,
      recoveredValuePerMonth: 0,
      changeVsCurrentPercent: 0,
      assumptions: [
        `Reflects ${(observedConversionRisk * 100).toFixed(1)}% estimated conversion friction from detected diagnostic findings.`,
        `Assumes consistent monthly inbound volume of ${monthlyVisitors.toLocaleString()} visitors.`,
      ],
    },
    {
      slug: 'conservative',
      name: 'Conservative Recovery',
      description: 'Expected recovery by resolving top critical issues (e.g. broken WhatsApp links, SSL errors).',
      conversionRate: conservativeRate,
      estimatedMonthlyLeads: conservativeLeads,
      estimatedMonthlyValue: conservativeValue,
      recoveredLeadsPerMonth: conservativeRecoveredLeads,
      recoveredValuePerMonth: conservativeRecoveredValue,
      changeVsCurrentPercent: conservativeChangePct,
      assumptions: [
        'Models 50% recovery of technical conversion risk by resolving primary critical/high failure points.',
        'Assumes traffic and lead value parameters remain constant during remediation.',
      ],
    },
    {
      slug: 'target',
      name: 'Target Full Remediation',
      description: 'Full baseline potential achieved by eliminating all identified lead, SEO, and security friction.',
      conversionRate: targetRate,
      estimatedMonthlyLeads: targetLeads,
      estimatedMonthlyValue: targetValue,
      recoveredLeadsPerMonth: targetRecoveredLeads,
      recoveredValuePerMonth: targetRecoveredValue,
      changeVsCurrentPercent: targetChangePct,
      assumptions: [
        'Assumes complete remediation of all identified diagnostic vulnerabilities.',
        'Restores conversion rate to full baseline potential.',
      ],
    },
  ];

  return {
    currency: 'INR',
    inputs: {
      monthlyVisitors,
      baselineConversionRate: baselineRate,
      averageLeadValue,
      source,
    },
    observedConversionRisk,
    scenarios,
  };
}
