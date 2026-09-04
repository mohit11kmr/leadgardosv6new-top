import type { PageRecord } from '@leadguard/shared';

export interface DuplicateContentGroup {
  hash: string;
  urls: string[];
  normalizedLength: number;
}

const MIN_CONTENT_LENGTH_FOR_DEDUP = 200; // near-empty pages (redirects/thin error pages) aren't meaningful "duplicates"

/**
 * Strips tags/scripts/styles/entities to plain visible text, collapses
 * whitespace, and lowercases — a deliberately simple normalization (not a
 * full boilerplate-removal pipeline: nav/header/footer markup isn't
 * specially stripped). This is an explicit, explainable tradeoff: it can
 * under-detect near-duplicates that differ only in a large body section
 * while sharing an unusually large nav/footer, but it never over-detects
 * by comparing raw HTML (which would flag any two pages sharing the same
 * template as "duplicate" even with entirely different content).
 */
function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#0?39;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** djb2 — fast, deterministic, non-cryptographic. Exact-match grouping only needs a stable fingerprint, not collision resistance against an adversary. */
function simpleHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function extractCanonical(html: string): string | null {
  const forward = /<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(html);
  if (forward) return forward[1]!;
  const backward = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i.exec(html);
  return backward ? backward[1]! : null;
}

function normalizeForCompare(url: string): string {
  return url.replace(/\/$/, '').replace(/^https?:\/\//i, '').toLowerCase();
}

/**
 * Groups pages whose normalized text content is byte-identical after
 * normalization — an exact-match strategy, not a fuzzy/percentage
 * similarity threshold. This is a deliberate, conservative choice: exact
 * matching after a documented, deterministic normalization is fully
 * explainable per finding ("these N pages produce identical visible text"),
 * whereas a similarity-score approach would need to justify a threshold
 * number that's much harder to defend as non-arbitrary. The tradeoff is
 * under-detection of near-duplicates that differ by a sentence or two —
 * an intentional bias toward zero false positives over full recall.
 *
 * Two exemptions, both applied before hashing:
 *   - Pagination: a page declaring rel=next/prev is expected to share
 *     template/structure with its neighbors by design — excluded from
 *     dedup grouping entirely rather than risk flagging a legitimate
 *     paginated listing.
 *   - Canonical exception: if every page in an otherwise-duplicate group
 *     declares a canonical, and all of those canonicals agree on one
 *     single target URL, that's the site correctly telling search engines
 *     which copy is authoritative — not a problem, so the group is dropped
 *     rather than flagged.
 */
export function detectDuplicateContent(pages: PageRecord[]): DuplicateContentGroup[] {
  const byHash = new Map<string, { urls: string[]; length: number; canonicals: Array<string | null> }>();

  for (const page of pages) {
    if (!page.htmlAvailable || !page.html) continue;
    if (page.statusCode >= 400) continue;
    if (/<link\s+[^>]*rel=["'](next|prev)["']/i.test(page.html)) continue;

    const text = stripHtmlToText(page.html);
    if (text.length < MIN_CONTENT_LENGTH_FOR_DEDUP) continue;

    const hash = simpleHash(text);
    const canonical = extractCanonical(page.html);
    const url = page.finalUrl || page.url;

    if (!byHash.has(hash)) byHash.set(hash, { urls: [], length: text.length, canonicals: [] });
    const entry = byHash.get(hash)!;
    entry.urls.push(url);
    entry.canonicals.push(canonical ? normalizeForCompare(canonical) : null);
  }

  const groups: DuplicateContentGroup[] = [];
  for (const [hash, entry] of byHash.entries()) {
    if (entry.urls.length <= 1) continue;

    // Canonical exception: every page in the group declares a canonical
    // (one entry per page, so this correctly requires ALL of them to have
    // one, not just some), and they all agree on exactly one target —
    // properly consolidated, not a problem.
    const allHaveCanonical = entry.canonicals.every((c): c is string => c !== null);
    if (allHaveCanonical && new Set(entry.canonicals).size === 1) {
      continue;
    }

    groups.push({ hash, urls: entry.urls, normalizedLength: entry.length });
  }

  return groups;
}
