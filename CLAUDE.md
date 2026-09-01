# CLAUDE.md — LeadGuard OS V6

This is an existing, production-oriented SaaS codebase — not a greenfield project. Read this before making any change.

## Prime directives

- Preserve existing functionality. Do not rewrite working systems without evidence something is broken.
- Do not delete functionality without explicit authorization.
- Do not make unrelated changes while fixing something else.
- Do not fabricate test results. Do not claim completion without verification.
- **No claim without evidence. No fix without a test. No feature is complete until it is verified.**
- Prefer minimal, reversible changes over large rewrites.
- Read the existing architecture before proposing new architecture — this repo has strong, deliberate conventions (see `docs/CLAUDE_ENGINEERING.md`); match them rather than introducing a new pattern.
- When uncertain about a library's current API, use `WebSearch`/`WebFetch` rather than guessing from training data.
- Never expose or print secret values (API keys, tokens, password hashes, `.env` contents) in output.
- Never commit secrets. `.env` and `.env.*` (except `.env.example`) are gitignored — keep it that way.
- Never modify production data without explicit authorization.

## Architecture (verified from source, not from old docs)

npm workspaces monorepo: `apps/api` (Express 5 + TypeScript, JWT+refresh-token auth, RBAC), `apps/web` (React 19 + Vite 6 + TanStack Query), `apps/worker` (BullMQ 5 + Redis, background audit/monitoring/webhook/report jobs), `packages/database` (Prisma 6 + PostgreSQL, sole Prisma client owner), `packages/shared` (scanner engines, SSRF guard, scoring — consumed by both api and worker; **must stay browser-safe**, apps/web imports from it too), `packages/config` (Zod-validated env loading, single source of truth for all env vars).

Product: a website diagnostic/security-audit SaaS (LeadGuard = lead-leakage, VaultGuard = security bugs), with agency/white-label tooling, Razorpay billing, and a public REST API. Full architecture detail: `docs/CLAUDE_ENGINEERING.md`.

## Non-negotiable repo-specific rules

- **No fake data.** Never fabricate metrics, customer counts, revenue figures, testimonials, or scores in UI or docs. Every number shown must trace to a real API/DB value. See `.agents/skills/leadguard-no-fake-data/SKILL.md`.
- **SSRF safety.** Any code that fetches a user-supplied URL (audits, webhooks, PDF logos, WhatsApp links) MUST go through `validateExternalUrl` (`packages/shared/src/url-security.ts`) first. Never call `fetch()`/navigate a browser to a raw user URL.
- **Org-scoped queries.** Every authenticated query must filter by `organizationId` from the verified JWT claims, never a client-supplied org ID. This is the primary IDOR defense in this codebase — don't weaken it.
- **Secrets that must stay usable are encrypted, not hashed.** Webhook signing secrets use `packages/shared/src/server-only/secret-encryption.ts` (AES-256-GCM) — that module is deliberately excluded from the main `@leadguard/shared` barrel export because it uses `node:crypto`, which breaks the `apps/web` browser bundle if pulled in. Import it via the `server-only/` subpath only from `apps/api`/`apps/worker`.
- **Config changes go through `packages/config/src/index.ts`** (Zod schema), not raw `process.env` reads scattered in application code — misconfiguration should fail at boot, not degrade silently at runtime.
- **Test suite conventions**: tests run with `ALLOW_LOCAL_FIXTURES=true` and `fileParallelism: false` (see `vitest.config.ts`). Full run needs `docker compose up -d` (Postgres on :15432, Redis on :16380) first. A small number of tests are genuinely flaky under full-suite load (timeout at the default 5000ms) — re-run in isolation before treating a failure as real.

## Verification contract

Every change must be reportable as:

1. What changed and why
2. Files changed
3. Tests added / tests executed / actual results (not assumed)
4. Browser verification (if UI-facing) — actually run it, don't claim it
5. Security impact
6. Database impact (migration? data risk?)
7. Remaining risks / follow-ups

If a check could not be run, say **"NOT RUN — reason: ..."**. Never say "verified" for something that wasn't actually executed.

## Change control

**Safe (do freely):** read/analyze code, run tests/lint/typecheck, write tests, write docs, small isolated fixes with a test.

**Requires review before proceeding (ask first):** architecture changes, DB migrations, auth changes, RBAC changes, payment changes, queue/worker changes, infra changes, major dependency upgrades.

**Forbidden without explicit authorization:** deleting major functionality, resetting/dropping database objects, modifying production data, rotating/changing secrets or credentials, `git push --force`, `git reset --hard`, `git clean`, any destructive infra command.

## Where to look first

- Skills for task-specific rules: `.claude/skills/*/SKILL.md` (engineering discipline) and `.agents/skills/leadguard-*/SKILL.md` (product/UI conventions — read both, they're not duplicates).
- Commands for structured workflows: `.claude/commands/*.md`.
- Full environment/tooling reference: `docs/CLAUDE_ENGINEERING.md`.
