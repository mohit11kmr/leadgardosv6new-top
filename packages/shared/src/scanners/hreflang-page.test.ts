import { describe, it, expect } from 'vitest';
import { runHreflangScanner } from './hreflang-page.js';
import type { PageRecord } from '../types.js';

function makePage(html: string, url = 'https://example.test/en/'): PageRecord {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    htmlAvailable: true,
    responseTimeMs: 50,
    depth: 0,
    redirectChain: [],
    html,
  };
}

describe('runHreflangScanner', () => {
  it('emits a finding for a malformed language code', () => {
    const res = runHreflangScanner(makePage(`<link rel="alternate" hreflang="notalang" href="https://example.test/x/" />`));
    expect(res.findings.some((f) => f.internalKey === 'HREFLANG_MALFORMED')).toBe(true);
  });

  it('emits a finding for conflicting duplicate declarations', () => {
    const html = `
      <link rel="alternate" hreflang="fr" href="https://example.test/fr/" />
      <link rel="alternate" hreflang="fr" href="https://example.test/fr-2/" />
    `;
    const res = runHreflangScanner(makePage(html));
    expect(res.findings.some((f) => f.internalKey === 'HREFLANG_CONFLICTING')).toBe(true);
  });

  it('emits a finding for a canonical/hreflang self-reference conflict', () => {
    const html = `
      <link rel="canonical" href="https://example.test/en/canonical/" />
      <link rel="alternate" hreflang="en" href="https://example.test/en/" />
    `;
    const res = runHreflangScanner(makePage(html, 'https://example.test/en/'));
    expect(res.findings.some((f) => f.internalKey === 'HREFLANG_CANONICAL_CONFLICT')).toBe(true);
  });

  it('emits no findings for valid, consistent hreflang usage', () => {
    const html = `<link rel="alternate" hreflang="en" href="https://example.test/en/" />`;
    const res = runHreflangScanner(makePage(html));
    expect(res.findings).toEqual([]);
  });

  it('emits no findings for a page with no hreflang markup', () => {
    const res = runHreflangScanner(makePage('<html><body>No i18n</body></html>'));
    expect(res.findings).toEqual([]);
    expect(res.status).toBe('COMPLETED');
  });
});
