---
name: testing
description: Vitest/integration test conventions for LeadGuard OS V6. Use before writing or running any test, or when a test fails and you're deciding whether it's a real regression.
---

# Testing

## Purpose
This repo runs a large (300+), real-integration-heavy test suite against actual Postgres/Redis — get the setup right and know how to tell a real failure from environmental flakiness.

## When to use
Before writing a new test, running the suite, or triaging a failure.

## Repository-specific rules
- Framework: Vitest. Config: `vitest.config.ts` (root) sets `fileParallelism: false` — tests share DB/Redis state and must run sequentially, not in parallel workers.
- Full suite needs real Postgres (`:15432`) and Redis (`:16380`): `docker compose up -d` first. `tests/global-setup.ts` truncates all tables once at suite start and seeds commercial plans.
- Tests run with `ALLOW_LOCAL_FIXTURES=true`, which relaxes `validateExternalUrl` to allow `localhost`/private targets (needed for tests that spin up a local HTTP server) and makes the crawler's `fetchPage` return canned "Example Domain" content on a real fetch failure (e.g. a fake `.example` domain). Don't rely on this flag ever being true outside tests.
- New test files: match the existing pattern — `import { describe, it, expect } from 'vitest'`, `supertest` against `apps/api/src/server.js` for HTTP-level tests, direct `db.*` calls for setup/assertions, `createAccessToken(userId, orgId)` from `apps/api/src/auth.js` for authenticated requests.
- Rate-limited endpoints (e.g. `/public/free-scan`, 3/hour/IP) keep counters in Redis, which is **not** reset by the DB truncation — a test hitting one repeatedly across runs can start from an already-exhausted quota. Flush the specific `ratelimit:*` Redis key in a `beforeAll`/`beforeEach` if a test needs a clean quota.
- Source-inspection tests (reading a `.ts` file's text and asserting a pattern appears, e.g. `tests/architecture.test.ts`, `tests/worker-wiring.test.ts`) are an established, legitimate pattern here for proving wiring that's impractical to exercise live (e.g. "is this job actually started from the worker entrypoint").
- A small number of tests are genuinely timing-sensitive and fail with `Test timed out in 5000ms` only under full-suite load (real headless-browser launches, DNS lookups) — not in isolation. Before treating a timeout as a real regression, re-run that file alone.

## Verification requirements
- Every new backend behavior gets a test that fails before the change and passes after (don't just add a test that trivially passes).
- Run the specific new/changed test file first, then the full suite, before reporting "done."
- Report actual pass/fail counts, never "should pass."

## Failure conditions
- A test failing only in the full run, passing in isolation, with a `Test timed out` message → re-run isolated before calling it a regression.
- `Can't reach database server at localhost:15432` → `docker compose up -d` wasn't run (or the daemon isn't running — `sudo systemctl start docker` may be needed in this environment).
- A "passing" test that never actually asserts anything meaningful (e.g. only checks a 200 status) is not real verification — assert on the actual data/behavior that matters.
