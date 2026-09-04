import { describe, it, expect } from 'vitest';
import { runStructuredDataScanner } from './structured-data-page.js';
import type { PageRecord } from '../types.js';

function makePage(html: string): PageRecord {
  return {
    url: 'https://example.test/product',
    finalUrl: 'https://example.test/product',
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

describe('runStructuredDataScanner', () => {
  it('emits a finding for malformed JSON-LD', () => {
    const res = runStructuredDataScanner(makePage(`<script type="application/ld+json">{invalid}</script>`));
    expect(res.status).toBe('COMPLETED');
    expect(res.findings.some((f) => f.internalKey === 'STRUCTURED_DATA_MALFORMED')).toBe(true);
  });

  it('emits a finding for a duplicate @type on the same page', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
    `;
    const res = runStructuredDataScanner(makePage(html));
    expect(res.findings.some((f) => f.internalKey === 'STRUCTURED_DATA_DUPLICATE_TYPE')).toBe(true);
  });

  it('emits no findings for valid, non-duplicated structured data', () => {
    const res = runStructuredDataScanner(makePage(`<script type="application/ld+json">{"@type":"Organization"}</script>`));
    expect(res.findings).toEqual([]);
  });

  it('emits no findings for a page with no structured data at all', () => {
    const res = runStructuredDataScanner(makePage('<html><body>Nothing here</body></html>'));
    expect(res.findings).toEqual([]);
    expect(res.status).toBe('COMPLETED');
  });
});
