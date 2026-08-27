import type { BusinessImpact, ExecutiveSummary, Finding, ScoreBreakdown, Severity } from './types.js';

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 100,
  HIGH: 60,
  MEDIUM: 30,
  LOW: 10,
  INFO: 0,
};

const CATEGORY_PRIORITY: Record<string, number> = {
  LEAD: 20,
  SECURITY: 15,
  ADVERTISING: 10,
  SEO: 10,
};

export interface ScoredFinding {
  finding: Finding;
  priorityScore: number;
}

export function rankFindings(findings: Finding[]): Finding[] {
  if (!findings.length) return [];

  // Count frequency of issues by ruleId to factor in widespread issues
  const ruleFrequency = new Map<string, number>();
  for (const f of findings) {
    const key = f.internalKey ?? f.ruleId;
    ruleFrequency.set(key, (ruleFrequency.get(key) ?? 0) + 1);
  }

  const scored: ScoredFinding[] = findings.map((finding) => {
    const key = finding.internalKey ?? finding.ruleId;
    const freq = ruleFrequency.get(key) ?? 1;
    const sevScore = SEVERITY_WEIGHT[finding.severity] ?? 0;
    const catScore = CATEGORY_PRIORITY[finding.category] ?? 5;
    const impactScore = finding.scoreImpact * 2;
    const scopeBonus = finding.scope === 'WEBSITE' || finding.scope === 'AUDIT' ? 15 : 5;
    const frequencyBonus = Math.min(20, freq * 3);

    const priorityScore = sevScore + catScore + impactScore + scopeBonus + frequencyBonus;
    return { finding, priorityScore };
  });

  // Sort with deterministic tie-breaking
  scored.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    if (b.finding.scoreImpact !== a.finding.scoreImpact) {
      return b.finding.scoreImpact - a.finding.scoreImpact;
    }
    const ruleCompare = a.finding.ruleId.localeCompare(b.finding.ruleId);
    if (ruleCompare !== 0) return ruleCompare;
    return a.finding.title.localeCompare(b.finding.title);
  });

  // Deduplicate ranked findings by title/ruleId so we return distinct actionable problems
  const seen = new Set<string>();
  const distinctRanked: Finding[] = [];
  for (const item of scored) {
    const dedupeKey = item.finding.internalKey ?? `${item.finding.ruleId}_${item.finding.title}`;
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      distinctRanked.push(item.finding);
    }
  }

  return distinctRanked;
}

export function buildExecutiveSummary(
  findings: Finding[],
  scores: ScoreBreakdown,
  impact: BusinessImpact
): ExecutiveSummary {
  const ranked = rankFindings(findings);
  const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
  const highCount = findings.filter((f) => f.severity === 'HIGH').length;
  const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.severity === 'LOW').length;

  let headline = '';
  if (criticalCount > 0) {
    headline = `Critical security or infrastructure blockers detected (${criticalCount} critical issues requiring immediate action).`;
  } else if (scores.overall >= 85) {
    headline = 'Strong diagnostic baseline with high technical integrity across evaluated pillars.';
  } else if (scores.overall >= 65) {
    headline = 'Moderate diagnostic baseline with opportunities to eliminate lead leakage and improve SEO/tracking.';
  } else {
    headline = 'High-risk diagnostic score with multiple conversion, tracking, or security failure points.';
  }

  const topProblems = ranked.slice(0, 5).map((f) => f.title);
  const priorityFixes = ranked.slice(0, 5).map((f) => f.recommendation);

  return {
    headline,
    overallScore: scores.overall,
    pillarScores: scores,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    topProblems,
    priorityFixes,
    businessImpact: impact,
    confidence: impact.confidence,
  };
}
