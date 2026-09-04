import { db } from '@leadguard/database';
import type { BusinessImpact } from '@leadguard/shared';

/**
 * Business-impact trend (Control Plane phase, Phase 5). Read-time only — no
 * new storage. Every audit already persists a BusinessImpact snapshot
 * (Audit.businessImpact, a Json column — see packages/shared/src/business-impact.ts)
 * at the time it ran; this service reads the audit history for an
 * organization/website and derives a trend from those existing snapshots.
 *
 * SEMANTIC SAFETY (do not violate when modifying this file): every number
 * here is a MODEL OUTPUT — an estimate of conversion-risk exposure, not
 * accounting data. Never rename anything here to imply real cash movement
 * ("revenue recovered", "money saved"). The public field names
 * (`estimatedRisk*`) and the `disclaimer` string on every result exist
 * specifically to prevent that misreading downstream.
 */

export type TrendPeriodInput = { days: 7 | 30 | 90 } | { start: string; end: string };

export interface TrendPeriod {
  start: Date;
  end: Date;
  label: string;
}

export function resolveTrendPeriod(input: TrendPeriodInput): TrendPeriod {
  if ('days' in input) {
    const end = new Date();
    const start = new Date(end.getTime() - input.days * 24 * 60 * 60 * 1000);
    return { start, end, label: `last_${input.days}_days` };
  }
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('Invalid custom period range: start/end must be valid dates with end > start');
  }
  return { start, end, label: `${input.start}..${input.end}` };
}

export interface BusinessImpactTrendResult {
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  period: { label: string; start: string; end: string };
  auditsInPeriod: number;
  currency: string | null;
  estimatedRiskFirst: number | null;
  estimatedRiskLatest: number | null;
  estimatedRiskMin: number | null;
  estimatedRiskMax: number | null;
  observedChange: number | null;
  observedChangePercent: number | null;
  findingsResolved: number | null;
  findingsIntroduced: number | null;
  summary: string;
  disclaimer: string;
}

const DISCLAIMER =
  'These figures are a model-based estimate of conversion-risk exposure (see packages/shared/src/business-impact.ts), not accounting data. They describe estimated risk and observed improvement — never actual revenue recovered or money saved.';

function issueKeySet(findings: Array<{ normalizedIssueKey: string | null; internalKey: string | null; ruleId: string }>): Set<string> {
  return new Set(findings.map((f) => f.normalizedIssueKey ?? f.internalKey ?? f.ruleId));
}

export class BusinessImpactTrendService {
  async getTrend(organizationId: string, options: { websiteId?: string; period: TrendPeriod }): Promise<BusinessImpactTrendResult> {
    const { period } = options;

    const auditsRaw = await db.audit.findMany({
      where: {
        organizationId,
        ...(options.websiteId ? { websiteId: options.websiteId } : {}),
        status: { in: ['COMPLETED', 'PARTIAL'] },
        createdAt: { gte: period.start, lte: period.end },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, businessImpact: true },
    });
    // Prisma's Json-field null filtering needs Prisma.DbNull, not a plain
    // `null` literal — simpler and just as correct to filter in JS, since
    // an audit genuinely without a business-impact snapshot must be
    // excluded from the trend rather than treated as a zero reading.
    const audits = auditsRaw.filter((a) => a.businessImpact !== null);

    const periodShape = { label: period.label, start: period.start.toISOString(), end: period.end.toISOString() };

    if (audits.length === 0) {
      return {
        status: 'INSUFFICIENT_DATA',
        period: periodShape,
        auditsInPeriod: 0,
        currency: null,
        estimatedRiskFirst: null,
        estimatedRiskLatest: null,
        estimatedRiskMin: null,
        estimatedRiskMax: null,
        observedChange: null,
        observedChangePercent: null,
        findingsResolved: null,
        findingsIntroduced: null,
        summary: 'Not available — no completed audits with a business-impact snapshot in this period.',
        disclaimer: DISCLAIMER,
      };
    }

    const readings = audits.map((a) => (a.businessImpact as unknown as BusinessImpact).estimatedOpportunityLoss);
    const currency = (audits[0].businessImpact as unknown as BusinessImpact).currency ?? 'INR';
    const first = readings[0];
    const latest = readings[readings.length - 1];
    const min = Math.min(...readings);
    const max = Math.max(...readings);
    const change = latest - first;
    const changePercent = first > 0 ? Math.round((change / first) * 1000) / 10 : null;

    const [firstFindings, latestFindings] = await Promise.all([
      db.auditFinding.findMany({ where: { auditId: audits[0].id }, select: { normalizedIssueKey: true, internalKey: true, ruleId: true } }),
      db.auditFinding.findMany({
        where: { auditId: audits[audits.length - 1].id },
        select: { normalizedIssueKey: true, internalKey: true, ruleId: true },
      }),
    ]);
    const firstKeys = issueKeySet(firstFindings);
    const latestKeys = issueKeySet(latestFindings);
    const findingsResolved = audits.length > 1 ? [...firstKeys].filter((k) => !latestKeys.has(k)).length : 0;
    const findingsIntroduced = audits.length > 1 ? [...latestKeys].filter((k) => !firstKeys.has(k)).length : 0;

    const direction = change < 0 ? 'improved' : change > 0 ? 'increased' : 'held steady';
    const summary =
      audits.length === 1
        ? `Single audit in this period — estimated risk was ${currency} ${first.toLocaleString('en-IN')}. Add more audits in this window for a trend.`
        : `Estimated risk ${direction} from ${currency} ${first.toLocaleString('en-IN')} to ${currency} ${latest.toLocaleString('en-IN')} across ${audits.length} audits (${findingsResolved} finding(s) resolved, ${findingsIntroduced} introduced).`;

    return {
      status: 'AVAILABLE',
      period: periodShape,
      auditsInPeriod: audits.length,
      currency,
      estimatedRiskFirst: first,
      estimatedRiskLatest: latest,
      estimatedRiskMin: min,
      estimatedRiskMax: max,
      observedChange: change,
      observedChangePercent: changePercent,
      findingsResolved,
      findingsIntroduced,
      summary,
      disclaimer: DISCLAIMER,
    };
  }
}

export const businessImpactTrendService = new BusinessImpactTrendService();
