import { describe, it, expect } from 'vitest';
import {
  debugExposureScanner,
  type VaultProbeFacts,
  type VaultFinding,
} from '@leadguard/shared';

function debugFacts(overrides: Partial<VaultProbeFacts> = {}): VaultProbeFacts {
  return {
    websiteUrl: 'https://example.com/',
    page: {
      url: 'https://example.com/',
      statusCode: 200,
      headers: {},
      html: '<html><body>Welcome</body></html>',
    },
    exposedAssets: [],
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard: debug-exposure scanner (LG-038)', () => {
  it('detects server/framework version disclosure via X-Powered-By', () => {
    const facts = debugFacts({
      page: { url: 'https://example.com/', statusCode: 200, headers: { 'x-powered-by': 'PHP/8.4.24' }, html: '<html/>' },
    });
    const findings = debugExposureScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_SERVER_LEAK');
    expect(findings[0].affectedUrl).toBe('https://example.com/');
  });

  it('detects a production stack trace in the body as debug-mode exposure', () => {
    const facts = debugFacts({
      page: {
        url: 'https://example.com/error',
        statusCode: 500,
        headers: {},
        html: 'Whoops, looks like something went wrong.\nStack trace:\n#0 /var/www/app.php(42): handler()',
      },
    });
    const findings = debugExposureScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_DEBUG_MODE');
    expect(findings[0].severity).toBe('CRITICAL');
  });

  it('flags accessible .env / .git / Ignition debug endpoints', () => {
    const facts = debugFacts({
      page: { url: 'https://example.com/', statusCode: 200, headers: {}, html: '<html/>' },
      exposedAssets: [{ url: 'https://example.com/.env', status: 200, contentType: 'text/plain', detectedPath: '/.env' }],
    });
    const findings = debugExposureScanner.probe(facts);
    expect(keys(findings)).toContain('SEC_DEBUG_MODE');
  });

  it('produces zero findings for a clean, well-configured site', () => {
    const facts = debugFacts({
      page: {
        url: 'https://example.com/',
        statusCode: 200,
        headers: { 'server': 'nginx' },
        html: '<html><body>Clean production site</body></html>',
      },
      exposedAssets: [{ url: 'https://example.com/favicon.ico', status: 404, contentType: 'image/x-icon', detectedPath: '/favicon.ico' }],
    });
    const findings = debugExposureScanner.probe(facts);
    expect(findings).toHaveLength(0);
  });
});
