import { normalizeUrl, type PageRecord } from '@leadguard/shared';
import { classifyError, fetchPage } from './fetcher.js';
import type { CrawlOptions, CrawlQueueItem, CrawlResult } from './types.js';

export function discoverLinks(page: PageRecord, origin: string): string[] {
  const links = [...page.html.matchAll(/(?:href|src)=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

  const discovered = new Set<string>();

  for (const raw of links) {
    try {
      const parsed = new URL(raw, page.finalUrl);
      if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
        continue;
      }
      const normalized = normalizeUrl(parsed.toString());
      discovered.add(normalized);
    } catch {
      // Ignore unparseable URIs
    }
  }

  return Array.from(discovered);
}

export class BoundedCrawler {
  private options: CrawlOptions;
  private pages = new Map<string, PageRecord>();
  private pending: CrawlQueueItem[] = [];
  private enqueued = new Set<string>();
  private activeWorkers = 0;
  private failures = 0;
  private lastError: string | undefined;

  constructor(options: Partial<CrawlOptions> = {}) {
    this.options = {
      concurrencyLimit: Math.max(1, Math.min(10, options.concurrencyLimit ?? 4)),
      maxPages: Math.max(1, Math.min(50, options.maxPages ?? 10)),
      maxDepth: Math.max(0, Math.min(5, options.maxDepth ?? 2)),
      perRequestTimeoutMs: options.perRequestTimeoutMs ?? 10_000,
      globalTimeoutMs: options.globalTimeoutMs ?? 60_000,
      maxResponseBytes: options.maxResponseBytes ?? 2_000_000,
      countryMode: options.countryMode ?? 'IN',
    };
  }

  async crawl(
    startUrl: string,
    signal: AbortSignal,
    onPageCrawled?: (page: PageRecord, queueState: { discovered: number; fetched: number }) => Promise<void> | void,
    onPageFailed?: (url: string, depth: number, parentUrl?: string, errorCode?: string) => Promise<void> | void
  ): Promise<CrawlResult> {
    const started = Date.now();
    const normalizedStart = normalizeUrl(startUrl);
    const origin = new URL(normalizedStart).origin;

    this.pending.push({ url: normalizedStart, depth: 0 });
    this.enqueued.add(normalizedStart);

    return new Promise<CrawlResult>((resolve, reject) => {
      let isDone = false;

      const checkFinished = () => {
        if (isDone) return;
        const reachedMaxPages = this.pages.size >= this.options.maxPages;
        const queueEmpty = this.pending.length === 0 && this.activeWorkers === 0;

        if (reachedMaxPages || queueEmpty || signal.aborted) {
          isDone = true;
          resolve({
            pages: this.pages,
            discoveredCount: this.enqueued.size,
            fetchedCount: this.pages.size,
            failedCount: this.failures,
            lastErrorCode: this.lastError,
            durationMs: Date.now() - started,
          });
        }
      };

      const dispatch = () => {
        if (isDone || signal.aborted) {
          checkFinished();
          return;
        }

        while (
          this.activeWorkers < this.options.concurrencyLimit &&
          this.pending.length > 0 &&
          this.pages.size + this.activeWorkers < this.options.maxPages
        ) {
          const item = this.pending.shift();
          if (!item) break;

          this.activeWorkers += 1;
          this.processItem(item, origin, signal, onPageCrawled, onPageFailed)
            .finally(() => {
              this.activeWorkers -= 1;
              dispatch();
            })
            .catch((err) => {
              // Handled internally in processItem
            });
        }

        checkFinished();
      };

      // Start initial dispatch
      dispatch();
    });
  }

  private async processItem(
    item: CrawlQueueItem,
    origin: string,
    signal: AbortSignal,
    onPageCrawled?: (page: PageRecord, queueState: { discovered: number; fetched: number }) => Promise<void> | void,
    onPageFailed?: (url: string, depth: number, parentUrl?: string, errorCode?: string) => Promise<void> | void
  ) {
    if (signal.aborted || this.pages.has(item.url) || item.depth > this.options.maxDepth) {
      return;
    }

    try {
      const pageTimeoutController = new AbortController();
      const timeoutId = setTimeout(() => pageTimeoutController.abort(), this.options.perRequestTimeoutMs);

      const combinedSignal = signal.aborted
        ? signal
        : pageTimeoutController.signal;

      const page = await fetchPage(
        item.url,
        combinedSignal,
        item.depth,
        item.parentUrl,
        this.options.maxResponseBytes
      );
      clearTimeout(timeoutId);

      this.pages.set(page.url, page);

      if (onPageCrawled) {
        await onPageCrawled(page, {
          discovered: this.enqueued.size,
          fetched: this.pages.size,
        });
      }

      // Discover new links within depth limit
      if (item.depth < this.options.maxDepth && this.pages.size < this.options.maxPages) {
        const links = discoverLinks(page, origin);
        for (const link of links) {
          if (!this.enqueued.has(link) && this.enqueued.size < this.options.maxPages * 3) {
            this.enqueued.add(link);
            this.pending.push({ url: link, depth: item.depth + 1, parentUrl: page.url });
          }
        }
      }
    } catch (error) {
      this.failures += 1;
      const errorCode = classifyError(error);
      this.lastError = errorCode;

      if (onPageFailed) {
        await onPageFailed(item.url, item.depth, item.parentUrl, errorCode);
      }
    }
  }
}
