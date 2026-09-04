import { describe, it, expect } from 'vitest';
import { scanStructuredData } from './structured-data.js';
import type { PageRecord } from '../types.js';

function makePage(html: string): PageRecord {
  return {
    url: 'https://example.test/',
    finalUrl: 'https://example.test/',
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

describe('scanStructuredData — JSON-LD', () => {
  it('detects and parses a valid single JSON-LD block, extracting @type', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`;
    const result = scanStructuredData(makePage(html));
    expect(result.hasValidJsonLd).toBe(true);
    expect(result.hasMalformedJsonLd).toBe(false);
    expect(result.jsonLdBlocks[0]?.schemaType).toEqual(['Organization']);
  });

  it('flags malformed JSON-LD without throwing', () => {
    const html = `<script type="application/ld+json">{"@type": "Organization", "name": }</script>`;
    const result = scanStructuredData(makePage(html));
    expect(result.hasMalformedJsonLd).toBe(true);
    expect(result.hasValidJsonLd).toBe(false);
    expect(result.jsonLdBlocks[0]?.parseError).toBeTruthy();
  });

  it('handles an @graph array and an @type array', () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["Person","Employee"]}]}</script>`;
    const result = scanStructuredData(makePage(html));
    expect(result.hasValidJsonLd).toBe(true);
    expect(result.jsonLdBlocks[0]?.schemaType).toEqual(['Organization', 'Person', 'Employee']);
  });

  it('detects a duplicate @type across two separate JSON-LD blocks on the same page', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product","name":"A"}</script>
      <script type="application/ld+json">{"@type":"Product","name":"B"}</script>
    `;
    const result = scanStructuredData(makePage(html));
    expect(result.duplicateTypes).toContain('Product');
  });

  it('does not report a duplicate when types differ across blocks', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script type="application/ld+json">{"@type":"BreadcrumbList"}</script>
    `;
    const result = scanStructuredData(makePage(html));
    expect(result.duplicateTypes).toEqual([]);
  });

  it('handles both valid and malformed blocks coexisting on one page', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization"}</script>
      <script type="application/ld+json">{not valid json}</script>
    `;
    const result = scanStructuredData(makePage(html));
    expect(result.hasValidJsonLd).toBe(true);
    expect(result.hasMalformedJsonLd).toBe(true);
    expect(result.jsonLdBlocks).toHaveLength(2);
  });

  it('reports no JSON-LD blocks for a page with none', () => {
    const result = scanStructuredData(makePage('<html><body>No structured data</body></html>'));
    expect(result.jsonLdBlocks).toEqual([]);
    expect(result.hasValidJsonLd).toBe(false);
    expect(result.hasMalformedJsonLd).toBe(false);
  });
});

describe('scanStructuredData — Microdata / RDFa presence', () => {
  it('detects Microdata via itemscope + itemtype', () => {
    const html = `<div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Widget</span></div>`;
    expect(scanStructuredData(makePage(html)).hasMicrodata).toBe(true);
  });

  it('does not flag Microdata when only itemscope is present without itemtype', () => {
    const html = `<div itemscope><span>Widget</span></div>`;
    expect(scanStructuredData(makePage(html)).hasMicrodata).toBe(false);
  });

  it('detects RDFa via typeof + vocab', () => {
    const html = `<div vocab="https://schema.org/" typeof="Product"><span property="name">Widget</span></div>`;
    expect(scanStructuredData(makePage(html)).hasRdfa).toBe(true);
  });
});
