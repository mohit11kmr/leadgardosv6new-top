import type { Finding, ImpactInputs } from '../types.js';

export interface FunnelStage {
  stage: 'TRAFFIC' | 'LANDING' | 'ENGAGEMENT' | 'CONTACT_INTENT' | 'LEAD_CONVERSION';
  label: string;
  description: string;
  inflowVisitors: number;
  dropoffPercent: number;
  retainedVisitors: number;
  leakedVisitors: number;
  technicalFrictionPoints: string[];
  findingCount: number;
}

export interface FunnelLeakageResult {
  trafficInput: number;
  baselineLeads: number;
  estimatedActualLeads: number;
  totalLeakedVisitors: number;
  stages: FunnelStage[];
  summary: string;
}

export function simulateFunnelLeakage(
  findings: Finding[],
  rawInputs: Partial<ImpactInputs> = {}
): FunnelLeakageResult {
  const monthlyVisitors = rawInputs.monthlyVisitors && rawInputs.monthlyVisitors > 0
    ? rawInputs.monthlyVisitors
    : 2500;
  const baselineConversionRate = rawInputs.conversionRate && rawInputs.conversionRate > 0
    ? rawInputs.conversionRate
    : 2.0;

  // Classify findings into funnel stages
  const landingIssues: string[] = [];
  const engagementIssues: string[] = [];
  const intentIssues: string[] = [];
  const conversionIssues: string[] = [];

  for (const f of findings) {
    const key = f.normalizedIssueKey ?? f.internalKey ?? f.title;
    if (f.category === 'SEO' || key.includes('TLS') || key.includes('NOINDEX') || key.includes('CANONICAL')) {
      if (!landingIssues.includes(f.title)) landingIssues.push(f.title);
    } else if (f.category === 'SECURITY' || key.includes('MIXED_CONTENT') || key.includes('OPENGRAPH') || key.includes('SEC_HEADER')) {
      if (!engagementIssues.includes(f.title)) engagementIssues.push(f.title);
    } else if (key.includes('FORM_MISSING') || key.includes('CTA_MISSING') || key.includes('NO_DETECTABLE')) {
      if (!intentIssues.includes(f.title)) intentIssues.push(f.title);
    } else if (f.category === 'LEAD' || key.includes('WHATSAPP') || key.includes('TEL')) {
      if (!conversionIssues.includes(f.title)) conversionIssues.push(f.title);
    }
  }

  // Calculate stage drop-offs based on industry base + technical friction additions
  // Base conversion model: Traffic (100%) -> Landing (85%) -> Engagement (50%) -> Contact Intent (15%) -> Conversion (2.0%)
  let currentFlow = monthlyVisitors;

  // 1. Traffic -> Landing
  const landingBaseDrop = 15; // 15% normal bounce
  const landingTechPenalty = Math.min(25, landingIssues.length * 5);
  const landingTotalDrop = Math.min(80, landingBaseDrop + landingTechPenalty);
  const landingRetained = Math.round(currentFlow * (1 - landingTotalDrop / 100));
  const landingLeaked = currentFlow - landingRetained;

  // 2. Landing -> Engagement
  const engageInflow = landingRetained;
  const engageBaseDrop = 40; // 40% normal drop
  const engageTechPenalty = Math.min(20, engagementIssues.length * 4);
  const engageTotalDrop = Math.min(85, engageBaseDrop + engageTechPenalty);
  const engageRetained = Math.round(engageInflow * (1 - engageTotalDrop / 100));
  const engageLeaked = engageInflow - engageRetained;

  // 3. Engagement -> Contact Intent
  const intentInflow = engageRetained;
  const intentBaseDrop = 60; // 60% normal drop
  const intentTechPenalty = Math.min(25, intentIssues.length * 8);
  const intentTotalDrop = Math.min(95, intentBaseDrop + intentTechPenalty);
  const intentRetained = Math.round(intentInflow * (1 - intentTotalDrop / 100));
  const intentLeaked = intentInflow - intentRetained;

  // 4. Contact Intent -> Lead Conversion
  const convInflow = intentRetained;
  const convBaseDrop = 25; // 25% normal drop at final action
  const convTechPenalty = Math.min(50, conversionIssues.length * 15);
  const convTotalDrop = Math.min(98, convBaseDrop + convTechPenalty);
  const finalLeads = Math.max(0, Math.round(convInflow * (1 - convTotalDrop / 100)));
  const convLeaked = convInflow - finalLeads;

  const baselineLeads = Math.round(monthlyVisitors * (baselineConversionRate / 100));

  const stages: FunnelStage[] = [
    {
      stage: 'TRAFFIC',
      label: '1. Inbound Traffic',
      description: 'Initial monthly visitor traffic arriving across search, social, direct, and campaign channels.',
      inflowVisitors: monthlyVisitors,
      dropoffPercent: 0,
      retainedVisitors: monthlyVisitors,
      leakedVisitors: 0,
      technicalFrictionPoints: [],
      findingCount: 0,
    },
    {
      stage: 'LANDING',
      label: '2. Landing & Discovery',
      description: 'Visitors successfully accessing pages without indexation blocks, security warnings, or load errors.',
      inflowVisitors: monthlyVisitors,
      dropoffPercent: landingTotalDrop,
      retainedVisitors: landingRetained,
      leakedVisitors: landingLeaked,
      technicalFrictionPoints: landingIssues,
      findingCount: landingIssues.length,
    },
    {
      stage: 'ENGAGEMENT',
      label: '3. Content Engagement & Trust',
      description: 'Visitors reading content and developing brand trust without mixed-content warnings or broken social previews.',
      inflowVisitors: engageInflow,
      dropoffPercent: engageTotalDrop,
      retainedVisitors: engageRetained,
      leakedVisitors: engageLeaked,
      technicalFrictionPoints: engagementIssues,
      findingCount: engagementIssues.length,
    },
    {
      stage: 'CONTACT_INTENT',
      label: '4. Contact Intent',
      description: 'Visitors seeking to initiate an inquiry prompted by visible CTAs and clear contact paths.',
      inflowVisitors: intentInflow,
      dropoffPercent: intentTotalDrop,
      retainedVisitors: intentRetained,
      leakedVisitors: intentLeaked,
      technicalFrictionPoints: intentIssues,
      findingCount: intentIssues.length,
    },
    {
      stage: 'LEAD_CONVERSION',
      label: '5. Action & Lead Capture',
      description: 'Final conversion via verified WhatsApp chat links, click-to-call dialing, or contact form submissions.',
      inflowVisitors: convInflow,
      dropoffPercent: convTotalDrop,
      retainedVisitors: finalLeads,
      leakedVisitors: convLeaked,
      technicalFrictionPoints: conversionIssues,
      findingCount: conversionIssues.length,
    },
  ];

  return {
    trafficInput: monthlyVisitors,
    baselineLeads,
    estimatedActualLeads: finalLeads,
    totalLeakedVisitors: monthlyVisitors - finalLeads,
    stages,
    summary: `Funnel simulator models prospective conversion decay from ${monthlyVisitors.toLocaleString()} inbound visitors to ~${finalLeads} converted leads, identifying ${landingIssues.length + engagementIssues.length + intentIssues.length + conversionIssues.length} technical friction points across 4 pipeline stages.`,
  };
}
