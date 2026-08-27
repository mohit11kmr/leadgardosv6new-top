import {
  scannerRegistry,
  calculateScores,
  type Finding,
  type PageRecord,
} from '@leadguard/shared';
import type { Severity, FindingChangeType } from '@prisma/client';
import type { BaselineSnapshot, PageBaseline, DetectedRegression } from './types.js';

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
  pagesEvaluated: number;
}

export class RegressionEngine {
  /**
   * Evaluates multi-page scan results against a baseline snapshot
   */
  async evaluate(
    websiteId: string,
    pages: PageRecord[],
    baseline: BaselineSnapshot | null
  ): Promise<RegressionComparisonResult> {
    const allCurrentFindings: Finding[] = [];
    const currentPagesBaseline: PageBaseline[] = [];
    const regressions: DetectedRegression[] = [];

    // Map previous baseline pages by normalized URL
    const previousPagesMap = new Map<string, PageBaseline>();
    if (baseline?.pages) {
      for (const p of baseline.pages) {
        previousPagesMap.set(p.normalizedUrl, p);
      }
    }

    let newCount = 0;
    let resolvedCount = 0;
    let persistingCount = 0;

    // 1. Process each crawled page
    for (const page of pages) {
      const pageFindings: Finding[] = [];

      if (page.html) {
        try {
          const { findings } = await scannerRegistry.runPageScanners(page);
          pageFindings.push(...findings);
          allCurrentFindings.push(...findings);
        } catch {
          // Protected against individual scanner errors
        }
      }

      const pageScores = calculateScores(pageFindings);
      const pageFindingKeys = new Set(
        pageFindings.map((f) => f.normalizedIssueKey || f.ruleId)
      );

      const previousPage = previousPagesMap.get(page.url) || previousPagesMap.get(page.finalUrl);
      const previousPageKeys = new Set(previousPage?.findingKeys || []);

      // Classify page-level findings
      for (const finding of pageFindings) {
        const key = finding.normalizedIssueKey || finding.ruleId;
        const wasPresent = previousPageKeys.has(key);

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
          affectedUrl: page.url,
          pageTitle: page.title || undefined,
          beforeState: wasPresent ? { status: 'FAILED' } : { status: 'PASSED' },
          afterState: { status: 'FAILED', evidence: finding.evidence as unknown as Record<string, unknown> },
          evidence: (finding.evidence as unknown as Record<string, unknown>) || {},
        });
      }

      // Detect resolved issues for this page
      for (const prevKey of previousPageKeys) {
        if (!pageFindingKeys.has(prevKey)) {
          resolvedCount++;
          regressions.push({
            ruleId: prevKey,
            category: 'REMEDIATION',
            severity: 'INFO',
            changeType: 'RESOLVED',
            title: `Resolved on ${page.url}: ${prevKey}`,
            description: `Issue (${prevKey}) has been remediated on ${page.url}.`,
            affectedUrl: page.url,
            pageTitle: page.title || undefined,
            beforeState: { status: 'FAILED' },
            afterState: { status: 'PASSED' },
            evidence: { resolvedAt: new Date().toISOString() },
          });
        }
      }

      currentPagesBaseline.push({
        normalizedUrl: page.url,
        title: page.title || '',
        statusCode: page.statusCode,
        scores: pageScores,
        findingKeys: Array.from(pageFindingKeys),
        signals: {},
      });
    }

    // 2. Global Site-Level Aggregation & Scoring
    const currentScores = calculateScores(allCurrentFindings);
    const previousScores = baseline?.scores || {
      lead: currentScores.lead,
      advertising: currentScores.advertising,
      seo: currentScores.seo,
      security: currentScores.security,
      overall: currentScores.overall,
    };

    const scoreDeltas = {
      lead: currentScores.lead - previousScores.lead,
      advertising: currentScores.advertising - previousScores.advertising,
      seo: currentScores.seo - previousScores.seo,
      security: currentScores.security - previousScores.security,
      overall: currentScores.overall - previousScores.overall,
    };

    const allFindingKeys = Array.from(
      new Set(allCurrentFindings.map((f) => f.normalizedIssueKey || f.ruleId))
    );

    const updatedBaseline: BaselineSnapshot = {
      websiteId,
      capturedAt: new Date().toISOString(),
      scores: currentScores,
      pages: currentPagesBaseline,
      findingKeys: allFindingKeys,
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
      pagesEvaluated: pages.length,
    };
  }
}

export const regressionEngine = new RegressionEngine();
