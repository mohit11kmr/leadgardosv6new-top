import type { PageRecord } from '../types.js';

export interface HreflangDeclaration {
  lang: string;
  href: string;
}

export interface HreflangScanResult {
  declarations: HreflangDeclaration[];
  /** hreflang values that don't look like a valid BCP47 language[-REGION] code or 'x-default'. */
  malformedLangCodes: string[];
  /** Same lang value declared more than once on this page with different hrefs — a direct conflict, not a judgment call. */
  duplicateLangConflicts: Array<{ lang: string; hrefs: string[] }>;
  canonicalUrl: string | null;
  /** This page declares an hreflang entry pointing at itself, but also has a canonical pointing somewhere else — a deterministic, page-local contradiction. */
  selfReferenceConflict: boolean;
}

const ALTERNATE_LINK_TAG_PATTERN = /<link\s+[^>]*rel=["']alternate["'][^>]*>/gi;
const VALID_LANG_PATTERN = /^(x-default|[a-zA-Z]{2,3}(-[a-zA-Z]{2})?)$/;

function normalizeForCompare(url: string): string {
  return url.replace(/\/$/, '').replace(/^https?:\/\//i, '').toLowerCase();
}

function extractCanonical(html: string): string | null {
  const forward = /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(html);
  if (forward) return forward[1]!;
  const backward = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i.exec(html);
  return backward ? backward[1]! : null;
}

/**
 * Extracts and validates a single page's hreflang declarations. Reciprocity
 * across pages (does page B declare hreflang back to page A?) requires the
 * full crawled page set and is checked separately, at the website level, in
 * apps/worker/src/audit/aggregation.ts.
 */
export function scanHreflang(page: PageRecord): HreflangScanResult {
  const html = page.html;
  const declarations: HreflangDeclaration[] = [];

  let match: RegExpExecArray | null;
  ALTERNATE_LINK_TAG_PATTERN.lastIndex = 0;
  while ((match = ALTERNATE_LINK_TAG_PATTERN.exec(html)) !== null) {
    const tag = match[0];
    const hreflangMatch = /hreflang=["']([^"']+)["']/i.exec(tag);
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (hreflangMatch && hrefMatch) {
      declarations.push({ lang: hreflangMatch[1]!, href: hrefMatch[1]! });
    }
  }

  const malformedLangCodes = [...new Set(declarations.filter((d) => !VALID_LANG_PATTERN.test(d.lang)).map((d) => d.lang))];

  const byLang = new Map<string, Set<string>>();
  for (const d of declarations) {
    if (!byLang.has(d.lang)) byLang.set(d.lang, new Set());
    byLang.get(d.lang)!.add(d.href);
  }
  const duplicateLangConflicts = [...byLang.entries()]
    .filter(([, hrefs]) => hrefs.size > 1)
    .map(([lang, hrefs]) => ({ lang, hrefs: [...hrefs] }));

  const canonicalUrl = extractCanonical(html);

  const pageUrl = page.finalUrl || page.url;
  let selfReferenceConflict = false;
  if (canonicalUrl) {
    const selfDeclaration = declarations.find((d) => normalizeForCompare(d.href) === normalizeForCompare(pageUrl));
    if (selfDeclaration && normalizeForCompare(canonicalUrl) !== normalizeForCompare(pageUrl)) {
      selfReferenceConflict = true;
    }
  }

  return { declarations, malformedLangCodes, duplicateLangConflicts, canonicalUrl, selfReferenceConflict };
}
