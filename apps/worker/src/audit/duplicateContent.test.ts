import { describe, it, expect } from 'vitest';
import { detectDuplicateContent } from './duplicateContent.js';
import type { PageRecord } from '@leadguard/shared';

function makePage(overrides: Partial<PageRecord>): PageRecord {
  return {
    url: 'https://shop.test/',
    finalUrl: 'https://shop.test/',
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    htmlAvailable: true,
    responseTimeMs: 100,
    depth: 0,
    redirectChain: [],
    html: '<html><body>' + 'x'.repeat(250) + '</body></html>',
    ...overrides,
  };
}

describe('detectDuplicateContent', () => {
  it('groups two pages with byte-identical normalized text', () => {
    const html = `<html><body><h1>About Us</h1><p>${'Lorem ipsum dolor sit amet. '.repeat(20)}</p></body></html>`;
    const pages = [
      makePage({ url: 'https://shop.test/about', finalUrl: 'https://shop.test/about', html }),
      makePage({ url: 'https://shop.test/about-copy', finalUrl: 'https://shop.test/about-copy', html }),
    ];
    const groups = detectDuplicateContent(pages);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.urls).toEqual(['https://shop.test/about', 'https://shop.test/about-copy']);
  });

  it('does not group pages with genuinely different content', () => {
    const pages = [
      makePage({ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', html: '<html><body>' + 'a'.repeat(250) + '</body></html>' }),
      makePage({ url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', html: '<html><body>' + 'b'.repeat(250) + '</body></html>' }),
    ];
    expect(detectDuplicateContent(pages)).toEqual([]);
  });

  it('ignores pages whose normalized content is too short to be meaningful', () => {
    const pages = [
      makePage({ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', html: '<html><body>hi</body></html>' }),
      makePage({ url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', html: '<html><body>hi</body></html>' }),
    ];
    expect(detectDuplicateContent(pages)).toEqual([]);
  });

  it('ignores error-status pages entirely', () => {
    const html = `<html><body>${'Error content repeated. '.repeat(20)}</body></html>`;
    const pages = [
      makePage({ url: 'https://shop.test/a', finalUrl: 'https://shop.test/a', html, statusCode: 200 }),
      makePage({ url: 'https://shop.test/b', finalUrl: 'https://shop.test/b', html, statusCode: 500 }),
    ];
    expect(detectDuplicateContent(pages)).toEqual([]);
  });

  it('exempts paginated pages (rel=next/prev) from duplicate grouping', () => {
    const html = `<html><head><link rel="next" href="/page/2" /></head><body>${'Listing item text here. '.repeat(20)}</body></html>`;
    const pages = [
      makePage({ url: 'https://shop.test/page/1', finalUrl: 'https://shop.test/page/1', html }),
      makePage({ url: 'https://shop.test/page/2', finalUrl: 'https://shop.test/page/2', html }),
    ];
    expect(detectDuplicateContent(pages)).toEqual([]);
  });

  it('applies the canonical exception: identical content is not flagged when all copies agree on one canonical target', () => {
    const bodyText = 'Shared content across variants. '.repeat(20);
    const pages = [
      makePage({
        url: 'https://shop.test/product?ref=a',
        finalUrl: 'https://shop.test/product?ref=a',
        html: `<html><head><link rel="canonical" href="https://shop.test/product" /></head><body>${bodyText}</body></html>`,
      }),
      makePage({
        url: 'https://shop.test/product?ref=b',
        finalUrl: 'https://shop.test/product?ref=b',
        html: `<html><head><link rel="canonical" href="https://shop.test/product" /></head><body>${bodyText}</body></html>`,
      }),
    ];
    expect(detectDuplicateContent(pages)).toEqual([]);
  });

  it('still flags identical content when canonicals disagree or are only partially present', () => {
    const bodyText = 'Unmanaged duplicate content here. '.repeat(20);
    const pages = [
      makePage({
        url: 'https://shop.test/dup-a',
        finalUrl: 'https://shop.test/dup-a',
        html: `<html><head><link rel="canonical" href="https://shop.test/dup-a" /></head><body>${bodyText}</body></html>`,
      }),
      makePage({
        url: 'https://shop.test/dup-b',
        finalUrl: 'https://shop.test/dup-b',
        html: `<html><body>${bodyText}</body></html>`, // no canonical at all
      }),
    ];
    const groups = detectDuplicateContent(pages);
    expect(groups).toHaveLength(1);
  });

  it('groups three or more pages sharing the same content into one group', () => {
    const html = `<html><body>${'Triplicate content block. '.repeat(20)}</body></html>`;
    const pages = [
      makePage({ url: 'https://shop.test/1', finalUrl: 'https://shop.test/1', html }),
      makePage({ url: 'https://shop.test/2', finalUrl: 'https://shop.test/2', html }),
      makePage({ url: 'https://shop.test/3', finalUrl: 'https://shop.test/3', html }),
    ];
    const groups = detectDuplicateContent(pages);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.urls).toHaveLength(3);
  });
});
