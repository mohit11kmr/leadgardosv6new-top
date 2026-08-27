import { describe, it, expect } from 'vitest';
import type { PageRecord } from '@leadguard/shared';
import { regressionEngine } from '../../apps/worker/src/monitoring/regressionEngine.js';
import type { BaselineSnapshot } from '../../apps/worker/src/monitoring/types.js';

describe('Watchdog Monitoring: True Multi-Page Regression Engine (Requirement 5, 7, 8, 9, 29)', () => {
  it('crawls and detects page-specific regressions across multiple pages preserving affectedUrl', async () => {
    const websiteId = '00000000-0000-0000-0000-000000000001';

    // Previous baseline: 2 pages (Home & Contact)
    const baseline: BaselineSnapshot = {
      websiteId,
      capturedAt: new Date(Date.now() - 3600000).toISOString(),
      scores: {
        lead: 90,
        advertising: 90,
        seo: 90,
        security: 90,
        overall: 90,
      },
      pages: [
        {
          normalizedUrl: 'https://mysite.test/',
          title: 'Home',
          statusCode: 200,
          scores: { lead: 100, advertising: 100, seo: 100, security: 100, overall: 100 },
          findingKeys: [],
          signals: {},
        },
        {
          normalizedUrl: 'https://mysite.test/contact',
          title: 'Contact',
          statusCode: 200,
          scores: { lead: 80, advertising: 80, seo: 80, security: 80, overall: 80 },
          findingKeys: ['OLD_CONTACT_ISSUE'],
          signals: {},
        },
      ],
      findingKeys: ['OLD_CONTACT_ISSUE'],
      signals: {},
    };

    // Current crawl: Home and Contact (Contact now has an issue, but OLD_CONTACT_ISSUE is gone)
    const pages: PageRecord[] = [
      {
        url: 'https://mysite.test/',
        finalUrl: 'https://mysite.test/',
        statusCode: 200,
        title: 'Home',
        html: '<html><head><title>Home</title></head><body><h1>Welcome</h1></body></html>',
        htmlAvailable: true,
        headers: {},
        depth: 0,
        responseTimeMs: 120,
        redirectChain: [],
        contentType: 'text/html',
      },
      {
        url: 'https://mysite.test/contact',
        finalUrl: 'https://mysite.test/contact',
        statusCode: 200,
        title: 'Contact Us',
        html: '<html><head><title>Contact</title></head><body><h1>Contact Us</h1></body></html>',
        htmlAvailable: true,
        headers: {},
        depth: 1,
        responseTimeMs: 180,
        redirectChain: [],
        contentType: 'text/html',
      },
    ];

    const result = await regressionEngine.evaluate(websiteId, pages, baseline);

    expect(result.pagesEvaluated).toBe(2);
    expect(result.updatedBaseline.pages.length).toBe(2);

    // Verify affectedUrl is captured on findings
    for (const reg of result.regressions) {
      expect(reg.affectedUrl).toBeDefined();
    }

    // Verify resolved finding on contact page
    const resolved = result.regressions.find((r) => r.ruleId === 'OLD_CONTACT_ISSUE');
    expect(resolved).toBeDefined();
    expect(resolved?.changeType).toBe('RESOLVED');
    expect(resolved?.affectedUrl).toBe('https://mysite.test/contact');
  });
});
