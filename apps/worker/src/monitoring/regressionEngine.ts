import {
  scannerRegistry,
  calculateScores,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';
import type { Severity, FindingChangeType } from '@prisma/client';
import type { BaselineSnapshot, DetectedRegression } from './types.js';

export interface RegressionComparisonResult {
  scores: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  };
  scoreDeltas: {
    lead: number;
    advertising: number;
    seo: number;
    security: number;
    overall: number;
  };
  regressions: DetectedRegression[];
  newRegressionsCount: number;
  resolvedCount: number;
  persistingCount: number;
  updatedBaseline: BaselineSnapshot;
}

export class RegressionEngine {
  /**
   * Evaluates current page findings against a baseline snapshot
   */
  async evaluate(
    websiteId: string,
    page: PageRecord,
    baseline: BaselineSnapshot | null
  ): Promise<RegressionComparisonResult> {
    // 1. Run all registered scanners on the page
    const currentFindings: Finding[] = [];
    if (page.html) {
      try {
        const { findings } = await scannerRegistry.runPageScanners(page);
        currentFindings.push(...findings);
      } catch {
        // Protected against individual scanner failures
      }
    }

    // 2. Calculate current diagnostic scores
    const currentScores = calculateScores(currentFindings);

    // 3. Extract baseline state
    const previousFindingKeys = new Set(baseline?.findingKeys || []);
    const previousScores = baseline?.scores || {
      lead: currentScores.lead,
      advertising: currentScores.advertising,
      seo: currentScores.seo,
      security: currentScores.security,
      overall: currentScores.overall,
    };

    const currentFindingKeys = new Set(
      currentFindings.map((f) => f.normalizedIssueKey || f.ruleId)
    );

    const regressions: DetectedRegression[] = [];
    let newCount = 0;
    let resolvedCount = 0;
    let persistingCount = 0;

    // Detect NEW and PERSISTING findings
    for (const finding of currentFindings) {
      const key = finding.normalizedIssueKey || finding.ruleId;
      const wasPresent = previousFindingKeys.has(key);

      const changeType: FindingChangeType = wasPresent
        ? 'PERSISTING'
        : finding.severity === 'CRITICAL' || finding.severity === 'HIGH'
          ? 'REGRESSED'
          : 'NEW';

      if (changeType === 'NEW' || changeType === 'REGRESSED') newCount++;
      if (changeType === 'PERSISTING') persistingCount++;

      regressions.push({
        ruleId: finding.ruleId,
        category: finding.category,
        severity: finding.severity as Severity,
        changeType,
        title: finding.title,
        description: finding.description,
        beforeState: wasPresent ? { status: 'FAILED' } : { status: 'PASSED' },
        afterState: { status: 'FAILED', evidence: finding.evidence as unknown as Record<string, unknown> },
        evidence: (finding.evidence as unknown as Record<string, unknown>) || {},
      });
    }

    // Detect RESOLVED findings (present in baseline, now absent)
    for (const prevKey of previousFindingKeys) {
      if (!currentFindingKeys.has(prevKey)) {
        resolvedCount++;
        regressions.push({
          ruleId: prevKey,
          category: 'REMEDIATION',
          severity: 'INFO',
          changeType: 'RESOLVED',
          title: `Resolved: ${prevKey}`,
          description: `The previous issue (${prevKey}) has been remediated.`,
          beforeState: { status: 'FAILED' },
          afterState: { status: 'PASSED' },
          evidence: { resolvedAt: new Date().toISOString() },
        });
      }
    }

    // 4. Calculate score deltas
    const scoreDeltas = {
      lead: currentScores.lead - previousScores.lead,
      advertising: currentScores.advertising - previousScores.advertising,
      seo: currentScores.seo - previousScores.seo,
      security: currentScores.security - previousScores.security,
      overall: currentScores.overall - previousScores.overall,
    };

    // 5. Create updated baseline
    const updatedBaseline: BaselineSnapshot = {
      websiteId,
      capturedAt: new Date().toISOString(),
      scores: currentScores,
      findingKeys: Array.from(currentFindingKeys),
      signals: {},
    };

    return {
      scores: currentScores,
      scoreDeltas,
      regressions,
      newRegressionsCount: newCount,
      resolvedCount,
      persistingCount,
      updatedBaseline,
    };
  }
}

export const regressionEngine = new RegressionEngine();
