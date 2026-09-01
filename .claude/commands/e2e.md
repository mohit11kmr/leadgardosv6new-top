---
description: Run LeadGuard OS V6's Playwright E2E suite (not currently run in CI) and report actual results.
---

Run the Playwright E2E suite for LeadGuard OS V6, following `.claude/skills/browser-testing/SKILL.md`.

1. **INSPECT** — confirm `docker compose up -d` is running (Postgres `:15432`, Redis `:16380`); `playwright.config.ts` boots `apps/api`/`apps/web` dev servers itself via its `webServer` config.
2. Run: `npx playwright test` (full) or a specific spec under `tests/e2e/` if `$ARGUMENTS` names one.
3. **VERIFY** — report actual pass/fail per spec. This suite is not currently wired into CI (`.github/workflows/ci.yml`) — a prior green CI run is not evidence these passed; they must actually be run.
4. **REPORT** — pass/fail per spec, and for any failure, the actual Playwright trace/error output.

Never report E2E as "passing" without having actually run `npx playwright test` this turn.
