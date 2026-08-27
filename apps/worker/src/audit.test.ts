import { describe, expect, it } from 'vitest';
import { scanPage, type PageRecord } from './audit.js';

const page = (html: string, headers: Record<string, string> = {}, finalUrl = 'https://example.com/'): PageRecord => ({
  url: finalUrl,
  finalUrl,
  statusCode: 200,
  contentType: 'text/html',
  headers,
  htmlAvailable: true,
  responseTimeMs: 1,
  depth: 0,
  redirectChain: [],
  html,
});

function hasRule(html: string, ruleId: string, severity?: string) {
  return scanPage(page(html)).some((finding) => finding.ruleId === ruleId && (!severity || finding.severity === severity));
}

describe('core scanner matrix', () => {
  it('accepts valid WhatsApp and rejects zero-prefix and duplicated country codes', () => {
    // Valid WhatsApp with proper Indian format: no finding
    expect(hasRule('<a href="https://wa.me/919876543210">x</a>', 'LG-001')).toBe(false);
    // Zero prefix leading digit: HIGH severity finding
    expect(hasRule('<a href="https://wa.me/091234567890">x</a>', 'LG-001', 'HIGH')).toBe(true);
    // Duplicated country code: HIGH severity finding
    expect(hasRule('<a href="https://wa.me/91919876543210">x</a>', 'LG-001', 'HIGH')).toBe(true);
  });

  it('detects telephone and form absence', () => {
    // Valid tel link present: no finding
    expect(hasRule('<a href="tel:+919876543210">call</a><form><button>Send</button></form>', 'LG-003')).toBe(false);
    // No tel link: LOW severity finding
    expect(hasRule('<p>none</p>', 'LG-003', 'LOW')).toBe(true);
    // No WhatsApp: MEDIUM severity finding
    expect(hasRule('<p>none</p>', 'LG-001', 'MEDIUM')).toBe(true);
  });

  it('detects tracking, noindex, canonical, mixed content, and OpenGraph gaps', () => {
    const findings = scanPage(
      page(
        '<meta name="robots" content="noindex"><link rel="canonical" href="https://example.com/"><script>gtag("config","G-TEST");fbq("init","x")</script><img src="http://cdn.test/a.png">'
      )
    );
    // noindex detected: HIGH severity
    expect(findings.some((f) => f.ruleId === 'LG-010' && f.severity === 'HIGH')).toBe(true);
    // canonical present: no finding
    expect(findings.some((f) => f.ruleId === 'LG-011')).toBe(false);
    // Meta Pixel not present: no finding
    expect(findings.some((f) => f.ruleId === 'LG-006')).toBe(false);
    // Mixed content (http image in https page): detected
    expect(findings.some((f) => f.ruleId === 'LG-013')).toBe(true);
    // OpenGraph missing: HIGH severity
    expect(findings.some((f) => f.ruleId === 'LG-012')).toBe(true);
  });

  it('reports missing security headers with evidence', () => {
    const findings = scanPage(page('<title>x</title>'));
    const csp = findings.find((f) => f.ruleId === 'LG-014' && f.title.includes('CSP'));
    expect(csp?.evidence).toMatchObject({ issue: 'Browser security policy is not declared' });
  });
});
