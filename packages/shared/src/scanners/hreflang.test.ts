import { describe, it, expect } from 'vitest';
import { scanHreflang } from './hreflang.js';
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

describe('scanHreflang', () => {
  it('extracts valid hreflang declarations', () => {
    const html = `
      <link rel="alternate" hreflang="en" href="https://example.test/en/" />
      <link rel="alternate" hreflang="fr" href="https://example.test/fr/" />
      <link rel="alternate" hreflang="x-default" href="https://example.test/" />
    `;
    const result = scanHreflang(makePage(html));
    expect(result.declarations).toHaveLength(3);
    expect(result.declarations.map((d) => d.lang)).toEqual(['en', 'fr', 'x-default']);
    expect(result.malformedLangCodes).toEqual([]);
  });

  it('flags a malformed language-region value', () => {
    const html = `<link rel="alternate" hreflang="english" href="https://example.test/en/" />`;
    const result = scanHreflang(makePage(html));
    expect(result.malformedLangCodes).toContain('english');
  });

  it('accepts valid BCP47 language-REGION forms', () => {
    const html = `<link rel="alternate" hreflang="en-US" href="https://example.test/en-us/" />`;
    const result = scanHreflang(makePage(html));
    expect(result.malformedLangCodes).toEqual([]);
  });

  it('detects a duplicate/conflicting hreflang declaration (same lang, different hrefs)', () => {
    const html = `
      <link rel="alternate" hreflang="fr" href="https://example.test/fr/" />
      <link rel="alternate" hreflang="fr" href="https://example.test/fr-alt/" />
    `;
    const result = scanHreflang(makePage(html));
    expect(result.duplicateLangConflicts).toHaveLength(1);
    expect(result.duplicateLangConflicts[0]?.lang).toBe('fr');
    expect(result.duplicateLangConflicts[0]?.hrefs).toHaveLength(2);
  });

  it('does not flag the same lang+href repeated (not a conflict, just redundant markup)', () => {
    const html = `
      <link rel="alternate" hreflang="fr" href="https://example.test/fr/" />
      <link rel="alternate" hreflang="fr" href="https://example.test/fr/" />
    `;
    const result = scanHreflang(makePage(html));
    expect(result.duplicateLangConflicts).toEqual([]);
  });

  it('detects a canonical/hreflang self-reference conflict', () => {
    const html = `
      <link rel="canonical" href="https://example.test/en/canonical-target/" />
      <link rel="alternate" hreflang="en" href="https://example.test/en/" />
    `;
    const result = scanHreflang(makePage(html, 'https://example.test/en/'));
    expect(result.selfReferenceConflict).toBe(true);
  });

  it('does not flag a conflict when the canonical matches the page itself', () => {
    const html = `
      <link rel="canonical" href="https://example.test/en/" />
      <link rel="alternate" hreflang="en" href="https://example.test/en/" />
    `;
    const result = scanHreflang(makePage(html, 'https://example.test/en/'));
    expect(result.selfReferenceConflict).toBe(false);
  });

  it('does not flag a conflict when there is no canonical at all', () => {
    const html = `<link rel="alternate" hreflang="en" href="https://example.test/en/" />`;
    const result = scanHreflang(makePage(html));
    expect(result.selfReferenceConflict).toBe(false);
    expect(result.canonicalUrl).toBeNull();
  });

  it('reports no declarations for a page with none', () => {
    const result = scanHreflang(makePage('<html><body>No i18n markup</body></html>'));
    expect(result.declarations).toEqual([]);
  });
});
