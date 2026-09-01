---
name: release
description: Release/deploy readiness checklist for LeadGuard OS V6. Use before telling the user something is "ready to ship" or before any git push/PR/deploy action.
---

# Release

## Purpose
This is a real production-oriented SaaS with a paying-customer billing system — "it compiles" is not "ready to ship."

## When to use
Before claiming a change is release-ready, and before any push/PR/deploy action (all of which require explicit user authorization per the Git Safety Protocol — this skill does not grant that authorization).

## Repository-specific rules
- No Dockerfile/deployment manifest exists in-repo for `apps/api`/`apps/web`/`apps/worker` themselves — only `docker-compose.yml` for local Postgres/Redis. Production deployment mechanism is undefined in-repo; don't assume a specific target (verify with the user).
- CI (`.github/workflows/ci.yml`) runs: `npm ci`, Prisma generate + `db push` against a fresh Postgres, typecheck, lint, `npx vitest run`, `npm run build --workspaces`. It does **not** run Playwright/E2E — a green CI run is not proof E2E-covered flows work.
- `packages/config`'s Zod schema fails the process at boot on missing/invalid required env vars (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `WEBHOOK_SECRET_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL`, `RAZORPAY_KEY_ID`/`SECRET`, plus conditional requirements like `SMTP_*` when `EMAIL_PROVIDER=SMTP`) — a fresh deploy environment needs all of these set correctly or the API/worker won't start. Check `.env.example` for the full current list before a deploy.
- `PAYMENT_PROVIDER_MODE=LIVE` requires real `rzp_live_*` Razorpay keys and refuses to start with test-mode keys (and vice versa) — a deliberate safety gate, don't bypass it to "just get it running."
- 8 known dependency vulnerabilities as of the last audit (`npm audit --omit=dev`), all in the `prisma` CLI's `deepmerge-ts` chain (dev-tooling, not a shipped runtime path) — review before a release, don't blanket `npm audit fix` without checking what it changes to `package-lock.json`.

## Workflow
1. Confirm the verification contract (see root `CLAUDE.md`) was actually satisfied for every change in the release: tests run (not just added), typecheck/lint/build clean, browser-verified if UI-facing.
2. Confirm no migration in the release set has been applied only to local dev, not reviewed for the target environment.
3. Confirm required env vars for the target environment are documented/set (see `.env.example`).
4. Only after all of the above: git operations (commit/push/PR) require the user's explicit go-ahead per session's Git Safety Protocol, scoped to exactly what was requested.

## Verification requirements
- `npm run typecheck --workspaces`, `npm run lint --workspaces`, `npm run build --workspaces` all clean.
- `npx vitest run` — report actual pass/fail counts.
- Any UI-facing change actually opened in a browser this session (see `browser-testing` skill).

## Failure conditions
- Claiming "ready to ship" without having actually run the full verification suite in this session is a verification-contract violation.
- Pushing, force-pushing, or creating a PR without the user's explicit request in this conversation.
