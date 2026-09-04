import { normalizeUrl, resolveAndValidateExternalUrl } from '@leadguard/shared';
import { fetchPinned } from '@leadguard/shared/dist/server-only/pinned-fetch.js';

export interface RobotsSitemapResult {
  /** Disallow rules from the `User-agent: *` block (path prefixes, robots.txt syntax — not full pattern-matching). */
  disallowedPaths: string[];
  /** Page URLs discovered via sitemap.xml/sitemap index, deduped and capped. */
  sitemapUrls: string[];
  robotsFetched: boolean;
  sitemapFetched: boolean;
}

const MAX_SITEMAP_URLS = 50;
const MAX_NESTED_SITEMAPS = 5;
const MAX_TEXT_BYTES = 2_000_000; // same bound fetcher.ts uses for a full page

/**
 * Fetches a small text/XML resource through the same SSRF-safe pinned-fetch
 * primitives every other fetcher in this codebase uses (resolveAndValidateExternalUrl
 * + fetchPinned) — deliberately NOT fetchPage(), which enforces
 * content-type: text/html and would reject robots.txt (text/plain) and
 * sitemap.xml (text/xml or application/xml) outright.
 */
async function safeFetchText(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const target = await resolveAndValidateExternalUrl(url);
    const res = await fetchPinned(target, {
      signal,
      headers: { 'user-agent': 'LeadGuardBot/2.0 (+https://leadguard.local)' },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_TEXT_BYTES) return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Parses only the `User-agent: *` block's Disallow rules (the wildcard
 * block every well-behaved generic crawler is expected to honor) plus any
 * `Sitemap:` directives, which apply regardless of which user-agent block
 * they appear under per the robots.txt spec. Deliberately does not attempt
 * per-bot-name rule matching (e.g. a `User-agent: Googlebot`-specific
 * block) — LeadGuardBot identifies as a generic crawler and only the
 * wildcard rules are meaningful to it.
 */
export function parseRobotsTxt(text: string): { disallowedPaths: string[]; sitemapUrls: string[] } {
  const lines = text.split(/\r?\n/);
  const disallowedPaths: string[] = [];
  const sitemapUrls: string[] = [];
  let inWildcardBlock = false;

  for (const rawLine of lines) {
    const line = (rawLine.split('#')[0] ?? '').trim();
    if (!line) continue;

    const uaMatch = /^user-agent:\s*(.+)$/i.exec(line);
    if (uaMatch) {
      inWildcardBlock = uaMatch[1]!.trim() === '*';
      continue;
    }

    const disallowMatch = /^disallow:\s*(.*)$/i.exec(line);
    if (disallowMatch && inWildcardBlock) {
      const path = disallowMatch[1]!.trim();
      if (path) disallowedPaths.push(path);
      continue;
    }

    // Sitemap: directives are global regardless of the current UA block.
    const sitemapMatch = /^sitemap:\s*(.+)$/i.exec(line);
    if (sitemapMatch) {
      sitemapUrls.push(sitemapMatch[1]!.trim());
    }
  }

  return { disallowedPaths, sitemapUrls };
}

function extractLocUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!.trim());
}

async function fetchSitemapUrls(sitemapUrl: string, signal: AbortSignal, depth = 0): Promise<string[]> {
  if (depth > MAX_NESTED_SITEMAPS) return [];
  const xml = await safeFetchText(sitemapUrl, signal);
  if (!xml) return [];

  if (/<sitemapindex[\s>]/i.test(xml)) {
    const nested = extractLocUrls(xml).slice(0, MAX_NESTED_SITEMAPS);
    const results = await Promise.all(nested.map((u) => fetchSitemapUrls(u, signal, depth + 1)));
    return results.flat();
  }

  return extractLocUrls(xml);
}

/**
 * Discovers crawl-relevant signals for `origin` (robots.txt Disallow rules
 * + sitemap-declared URLs) before the main link-following crawl starts.
 * Best-effort and fully non-fatal: a missing/unreachable robots.txt or
 * sitemap.xml is a normal, common case (most small sites have neither),
 * not an error — the crawler falls back to pure link discovery exactly as
 * it did before this existed.
 */
export async function fetchRobotsAndSitemap(origin: string, signal: AbortSignal): Promise<RobotsSitemapResult> {
  const robotsText = await safeFetchText(`${origin}/robots.txt`, signal);

  let disallowedPaths: string[] = [];
  let sitemapUrlsFromRobots: string[] = [];
  if (robotsText !== null) {
    const parsed = parseRobotsTxt(robotsText);
    disallowedPaths = parsed.disallowedPaths;
    sitemapUrlsFromRobots = parsed.sitemapUrls;
  }

  const sitemapCandidates = sitemapUrlsFromRobots.length > 0 ? sitemapUrlsFromRobots : [`${origin}/sitemap.xml`];
  const discovered = new Set<string>();
  let sitemapFetched = false;

  for (const candidate of sitemapCandidates.slice(0, MAX_NESTED_SITEMAPS)) {
    if (signal.aborted || discovered.size >= MAX_SITEMAP_URLS) break;
    const urls = await fetchSitemapUrls(candidate, signal);
    if (urls.length > 0) sitemapFetched = true;
    for (const u of urls) {
      if (discovered.size >= MAX_SITEMAP_URLS) break;
      try {
        discovered.add(normalizeUrl(u));
      } catch {
        // skip unparseable <loc> entries
      }
    }
  }

  return {
    disallowedPaths,
    sitemapUrls: [...discovered],
    robotsFetched: robotsText !== null,
    sitemapFetched,
  };
}

/** `/` (root Disallow) blocks everything; otherwise a simple prefix match, matching robots.txt's own documented matching rule (not full wildcard/regex support). */
export function isPathDisallowed(pathname: string, disallowedPaths: string[]): boolean {
  return disallowedPaths.some((rule) => rule === '/' || pathname.startsWith(rule));
}
