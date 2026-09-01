---
name: performance
description: Known performance-sensitive areas and measurement approach for LeadGuard OS V6. Use before optimizing, or when asked to investigate slowness.
---

# Performance

## Purpose
Point at the parts of this codebase where performance is either already a known concern or has already been tuned, so effort isn't wasted re-discovering it or, worse, undoing a deliberate optimization.

## When to use
Investigating slowness, or before adding an optimization.

## Repository-specific rules
- `apps/web`'s production bundle is a single ~1.4MB JS chunk (Vite warns on this at build time) — no code-splitting configured yet. Don't "fix" this as a drive-by; it's a known, undecided tradeoff, not an oversight to silently resolve.
- The audit crawler (`apps/worker/src/audit/crawler.ts` + `fetcher.ts`) is bounded by `maxPages`/`maxDepth`/`perRequestTimeoutMs`/`maxResponseBytes` config — these exist specifically to cap worst-case cost per audit; don't remove a bound to "fix" a slow scan without understanding why it's slow first.
- The optional headless-browser rescan (`apps/worker/src/audit/renderedFetch.ts`, gated by `config.ENABLE_JS_RENDERED_RESCAN`) launches a real Chromium instance per audit homepage — meaningfully more expensive than the plain-fetch path. It's disabled in tests for this reason (see `testing` skill).
- DB query patterns: this codebase already fixed several N+1/race-condition classes of bug in worker jobs (see commit history around "DB race conditions + worker correctness") — when adding a new list/aggregate query, check for an existing similar query first (e.g. `adminService`'s cursor-pagination helpers) rather than writing a naive per-row lookup loop.
- Public/high-traffic endpoints use a Redis cache-aside pattern with a short TTL (see `apps/api/src/services/public/platformStatsService.ts` or `agencyOverviewService.ts` for the shape: try cache → compute → best-effort cache write, never let a cache failure break the response).

## Workflow
1. Measure before optimizing — get an actual number (query time, bundle size, response time), don't guess.
2. Check whether the "slow" thing is already an intentional bound (crawl limits, rate limits) before changing it.
3. For a new expensive/high-traffic read, consider the cache-aside pattern above rather than hitting Postgres on every request.

## Verification requirements
- A before/after measurement for any change made specifically for performance (not just "should be faster").
- No regression in the bounded-crawl safety limits without an explicit decision to change them.

## Failure conditions
- Removing a `maxPages`/timeout/rate-limit bound to make something "not time out" without addressing the underlying slow operation reintroduces the abuse/cost risk those bounds exist to prevent.
