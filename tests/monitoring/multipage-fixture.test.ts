import { describe, it, expect } from 'vitest';
import type { PageRecord } from '@leadguard/shared';
import { regressionEngine } from '../../apps/worker/src/monitoring/regressionEngine.js';

describe('Watchdog Reliability: 10-Page Crawl Fixture & Isolated Page Regression (Requirement 18)', () => {
  function generateTenPages(mutatePageNumber?: number): PageRecord[] {
    return Array.from({ length: 10 }, (_, i) => {
      const pageIndex = i + 1;
      const url = `https://myshop.test/page-${pageIndex}`;
      const isMutated = pageIndex === mutatePageNumber;

      const html = isMutated
        ? `<html><head><title>Page ${pageIndex}</title></head><body><h1>Page ${pageIndex}</h1><p>Broken content</p></body></html>`
        : `<html><head><title>Page ${pageIndex}</title></head><body><h1>Page ${pageIndex}</h1><a href="https://wa.me/919999999999">Chat on WhatsApp</a></body></html>`;

      return {
        url,
        finalUrl: url,
        statusCode: 200,
        title: `Page ${pageIndex}`,
        html,
        htmlAvailable: true,
        headers: {},
        depth: 1,
        responseTimeMs: 120,
        redirectChain: [],
        contentType: 'text/html',
      };
    });
  }

  it('evaluates 10 pages twice and isolates regression exclusively to the single mutated page', async () => {
    const websiteId = '00000000-0000-0000-0000-000000000001';

    // 1. Initial 10-Page Run -> Capture Baseline
    const pagesRun1 = generateTenPages();
    const evaluation1 = await regressionEngine.evaluate(websiteId, pagesRun1, null);

    expect(evaluation1.pagesEvaluated).toBe(10);
    expect(evaluation1.updatedBaseline.pages.length).toBe(10);

    // 2. Second 10-Page Run -> Mutate only Page 4 (removes WhatsApp button)
    const pagesRun2 = generateTenPages(4);
    const evaluation2 = await regressionEngine.evaluate(
      websiteId,
      pagesRun2,
      evaluation1.updatedBaseline
    );

    expect(evaluation2.pagesEvaluated).toBe(10);

    // Filter regressions: only Page 4 should have new/regressed findings for missing CTA/chat
    const page4Regressions = evaluation2.regressions.filter(
      (r) => r.affectedUrl === 'https://myshop.test/page-4'
    );
    const otherPageRegressions = evaluation2.regressions.filter(
      (r) => r.affectedUrl !== 'https://myshop.test/page-4' && (r.changeType === 'NEW' || r.changeType === 'REGRESSED')
    );

    expect(page4Regressions.length).toBeGreaterThan(0);
    expect(otherPageRegressions.length).toBe(0);
  });
});
