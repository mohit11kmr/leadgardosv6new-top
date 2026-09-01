---
name: browser-testing
description: Playwright E2E and live-browser verification conventions for LeadGuard OS V6. Use when writing an E2E spec or when asked to actually verify a UI change works.
---

# Browser Testing

## Purpose
This repo has real Playwright E2E coverage and a real browser automation tool available — use them instead of claiming a UI change "should work."

## When to use
Writing/changing an E2E spec, or verifying any frontend change before reporting it complete.

## Repository-specific rules
- Playwright config: `playwright.config.ts` (root). `testDir: tests/e2e`. It boots both `apps/api` and `apps/web` dev servers itself (`webServer` array) against the same local Postgres/Redis as the unit test suite — no separate environment needed, just `docker compose up -d` first.
- Existing specs: `tests/e2e/core.spec.ts`, `agency-hardening.spec.ts`, `phase8-platform.spec.ts`, `vaultguard.spec.ts`. Chromium is already installed (`~/.cache/ms-playwright`).
- **Gap**: Playwright/E2E is not currently wired into `.github/workflows/ci.yml` — only the Vitest unit/integration suite runs in CI. E2E is developer/local-only right now. Flag this if asked about CI coverage; don't assume E2E ran just because CI is green.
- For interactively verifying a running app (not writing a permanent spec), this session has `mcp__claude-in-chrome__*` browser automation tools (deferred — load via `ToolSearch` first) that drive the user's actual Chrome. Prefer this for one-off "does this screen actually work" checks; write a Playwright spec only for something that should be regression-tested going forward.
- Also see `.agents/skills/leadguard-browser-qa/SKILL.md` for this repo's product-specific browser-QA checklist (console errors, network tab, responsive breakpoints) — read it alongside this skill, it's not duplicated here.

## Workflow
1. Start the app (`npm run dev` at root runs api+web+worker together, or let Playwright's `webServer` do it for a `npx playwright test` run).
2. For a permanent regression test: add a spec under `tests/e2e/`, following the existing specs' pattern (signup → action → assert rendered state, no uncaught console errors).
3. For a one-off verification: use the Chrome automation tools to actually click through the flow and read the console/network tabs.

## Verification requirements
- `npx playwright test` passes locally for anything touching a covered flow.
- No uncaught browser console errors during the flow under test.
- Report which method was used (Playwright spec vs. live Chrome check) and the actual result — never "should render correctly" without having looked.

## Failure conditions
- Claiming a UI change is verified without either running a Playwright spec or actually opening it in a browser this session is a verification-contract violation (see root `CLAUDE.md`).
