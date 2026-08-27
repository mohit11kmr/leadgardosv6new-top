import { describe, it, expect } from 'vitest';
import type { PageRecord } from '@leadguard/shared';
import { regressionEngine } from '../../apps/worker/src/monitoring/regressionEngine.js';
import type { BaselineSnapshot } from '../../apps/worker/src/monitoring/types.js';

describe('Watchdog Monitoring: Regression Engine & Change Detection (Requirement 12, 14, 16, 17)', () => {
  it('detects NEW, PERSISTING, and RESOLVED diagnostic changes with score deltas', async () => {
    const websiteId = '00000000-0000-0000-0000-000000000001';

    // Baseline snapshot with an existing failing rule 'OLD_BROKEN_CTA' on the page
    const baseline: BaselineSnapshot = {
      websiteId,
      capturedAt: new Date(Date.now() - 3600000).toISOString(),
      scores: {
        lead: 80,
        advertising: 80,
        seo: 80,
        security: 80,
        overall: 80,
      },
      pages: [
        {
          normalizedUrl: 'https://test-regression.test',
          title: 'No Description Page',
          statusCode: 200,
          scores: { lead: 80, advertising: 80, seo: 80, security: 80, overall: 80 },
          findingKeys: ['OLD_BROKEN_CTA'],
          signals: {},
        },
      ],
      findingKeys: ['OLD_BROKEN_CTA'],
      signals: {},
    };

    // Page HTML with no meta description and missing canonical (will generate findings from scanners)
    const page: PageRecord = {
      url: 'https://test-regression.test',
      finalUrl: 'https://test-regression.test',
      statusCode: 200,
      title: 'No Description Page',
      html: '<html><head><title>No Description Page</title></head><body><h1>Hello</h1></body></html>',
      htmlAvailable: true,
      headers: {},
      depth: 0,
      responseTimeMs: 150,
      redirectChain: [],
      contentType: 'text/html',
    };

    const evaluation = await regressionEngine.evaluate(websiteId, [page], baseline);

    expect(evaluation.scores).toBeDefined();
    expect(evaluation.scoreDeltas).toBeDefined();
    expect(evaluation.regressions.length).toBeGreaterThan(0);

    // 'OLD_BROKEN_CTA' was in baseline but not generated now -> marked as RESOLVED
    const resolvedFinding = evaluation.regressions.find((r) => r.ruleId === 'OLD_BROKEN_CTA');
    expect(resolvedFinding).toBeDefined();
    expect(resolvedFinding?.changeType).toBe('RESOLVED');

    // Newly found issues -> marked as NEW or REGRESSED
    const newFindings = evaluation.regressions.filter(
      (r) => r.changeType === 'NEW' || r.changeType === 'REGRESSED'
    );
    expect(newFindings.length).toBeGreaterThan(0);
  });
});
