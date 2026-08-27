import { describe, it, expect } from 'vitest';
import type { PageRecord } from '@leadguard/shared';
import { regressionEngine } from '../../apps/worker/src/monitoring/regressionEngine.js';

describe('Watchdog Performance: Multi-Page Benchmark (Requirement 30)', () => {
  function createMockPage(index: number): PageRecord {
    return {
      url: `https://benchmark.test/page-${index}`,
      finalUrl: `https://benchmark.test/page-${index}`,
      statusCode: 200,
      title: `Page ${index}`,
      html: `<html><head><title>Page ${index}</title></head><body><h1>Page ${index}</h1><a href="https://wa.me/919999999999">WhatsApp</a></body></html>`,
      htmlAvailable: true,
      headers: {},
      depth: 1,
      responseTimeMs: 100 + index * 10,
      redirectChain: [],
      contentType: 'text/html',
    };
  }

  it('measures regression engine performance on 1, 5, and 10 pages', async () => {
    const websiteId = '00000000-0000-0000-0000-000000000001';

    // 1 Page Benchmark
    const start1 = Date.now();
    const result1 = await regressionEngine.evaluate(websiteId, [createMockPage(1)], null);
    const duration1 = Date.now() - start1;
    expect(result1.pagesEvaluated).toBe(1);
    expect(duration1).toBeLessThan(1000);

    // 5 Pages Benchmark
    const pages5 = Array.from({ length: 5 }, (_, i) => createMockPage(i + 1));
    const start5 = Date.now();
    const result5 = await regressionEngine.evaluate(websiteId, pages5, result1.updatedBaseline);
    const duration5 = Date.now() - start5;
    expect(result5.pagesEvaluated).toBe(5);
    expect(duration5).toBeLessThan(2000);

    // 10 Pages Benchmark
    const pages10 = Array.from({ length: 10 }, (_, i) => createMockPage(i + 1));
    const start10 = Date.now();
    const result10 = await regressionEngine.evaluate(websiteId, pages10, result5.updatedBaseline);
    const duration10 = Date.now() - start10;
    expect(result10.pagesEvaluated).toBe(10);
    expect(duration10).toBeLessThan(3000);
  });
});
