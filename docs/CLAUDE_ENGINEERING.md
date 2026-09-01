# Claude Engineering Environment — LeadGuard OS V6

Established in Phase 0 (bootstrap only — no application code was changed to produce this document; everything below was verified against actual source).

## 1. Current architecture (verified from source)

npm workspaces monorepo (`package.json`: `workspaces: ["apps/*", "packages/*"]`).

```
Browser ──▶ apps/web (React 19 + Vite 6 + TanStack Query 5)
              │ fetch + Bearer token (localStorage) + HttpOnly refresh cookie
              ▼
        apps/api (Express 5, /api/v1, ~128 routes)  ──▶  PostgreSQL (via packages/database, Prisma 6)
              │ BullMQ enqueue                              ▲
              ▼                                             │
        Redis (queues + rate limits)  ──▶  apps/worker (BullMQ 5: audit / monitoring / vault /
                                            webhook / report / agency-* queues, plus a
                                            setInterval-based outbox-replay loop)
                                                    │ SSRF-checked HTTP fetch
                                                    ▼
                                       Target customer websites
```

- **apps/api** — Express 5, JWT (15 min access) + rotating hashed refresh tokens with reuse detection, Argon2id passwords, RBAC via `apps/api/src/middleware/rbac.ts`, Zod input validation, Helmet, Redis-backed rate limiting.
- **apps/web** — React 19 SPA, TanStack Query for data fetching, typed API client in `apps/web/src/api/*`. Must stay free of Node-only imports (enforced by `tests/architecture.test.ts`).
- **apps/worker** — BullMQ 5 job processors for the audit crawler, VaultGuard security scanner, monitoring re-checks, webhook delivery, PDF/report generation, and agency prospecting/pitch/competitor jobs.
- **packages/database** — sole Prisma client owner. 50+ models. One rebaselined migration plus several added during this project's own work (see `packages/database/prisma/migrations/`).
- **packages/shared** — scanner engines (SEO/tracking/security-headers/TLS/cart/etc.), SSRF URL validator, scoring engine, auto-fix/remediation content. Its main barrel export must stay browser-safe; anything using `node:*` built-ins lives under `packages/shared/src/server-only/` instead.
- **packages/config** — single Zod schema (`packages/config/src/index.ts`) validating every environment variable at process boot, with cross-field checks (e.g. `EMAIL_PROVIDER=SMTP` requires `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`).

Product surface: LeadGuard (lead-leakage audits), VaultGuard (security-bug scanning, HackerOne-style CWE/CVSS taxonomy and OPEN→TRIAGED→FIXED→VERIFIED lifecycle), agency/white-label tooling, Razorpay billing, a public developer API with OpenAPI docs (`apps/api/src/openapi.ts`), and a lightweight admin-authored blog/CMS.

## 2. Existing AI tooling (audited, not assumed)

| Location | Contents | Status |
|---|---|---|
| `.claude/` | Was empty before this bootstrap | Now populated by this Phase 0 (skills/agents/commands below) |
| `.agents/skills/leadguard-*` | 7 product/UI-system skills (api-contract, backend-first-ui, browser-qa, no-fake-data, product, ui-system, ux-review) | **Keep** — actively product-relevant, not duplicated by the new `.claude/skills/*` |
| `.opencode/` | Full OpenCode CLI install (own `node_modules`, `package.json`) + a duplicate copy of the same 7 `leadguard-*` skills | Pre-existing tooling for a different agent CLI (OpenCode), not Claude Code. Left untouched. |
| `CLAUDE.md` | Did not exist | **Added** in this bootstrap (root of repo) |
| `AGENTS.md` | Does not exist | Not added — `.agents/skills/*` already serves an equivalent purpose for the product-skill content; adding a second file risked duplicate/conflicting guidance |

## 3. MCP audit

Three files (`./mcp_config.json`, `.agents/mcp_config.json`, `.opencode/mcp_config.json`) declare identical config for two servers:

```json
{ "playwright": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-playwright"]},
  "chrome-devtools": {"command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"]} }
```

**Important finding**: this is **not** Claude Code's native MCP config format/location (`.mcp.json` at repo root, or `claude mcp add`). No `.mcp.json` exists in this repo. These files appear to be written for a different tool (most plausibly OpenCode, given `.opencode/`'s own installation) — **Claude Code does not currently load any MCP server from this repository.**

| Capability | Existing? | Provider | Risk | Useful for LeadGuard? | Recommendation |
|---|---|---|---|---|---|
| GitHub | No | — | — | Yes (PRs, issues, CI checks) | **ADD** if the user wants Claude to inspect GitHub directly — no `gh` CLI is installed in this environment either. Needs explicit setup + auth. |
| Docs/context retrieval (Context7-style) | No | — | Low | Marginal — `WebSearch`/`WebFetch` (native Claude Code tools, not MCP) already cover "look up current React/Prisma/BullMQ docs" | **OPTIONAL** — don't add unless doc lookups become frequent friction; avoid a second doc-retrieval mechanism. |
| Browser testing | Partial | `mcp__claude-in-chrome__*` (Anthropic's own, deferred-loaded) is available in this session; the repo's `chrome-devtools`/`playwright` MCP entries are inert (wrong config location) | Low | Yes | **KEEP** the native `claude-in-chrome` tools for live verification; **AVOID** enabling the repo's `chrome-devtools-mcp`/`server-playwright` entries as a *third* browser-automation path — the repo already has a working Playwright *test* setup (see §6) plus the native Chrome tools; a third mechanism is redundant. |
| Filesystem/repo access | Yes (native) | Built-in Read/Write/Edit/Bash/Grep/Glob | — | Yes | **KEEP** — no MCP needed for this. |
| PostgreSQL | No | — | Medium (write access to a DB) | Marginal — Prisma CLI + `psql`-equivalent via Bash already cover inspection | **AVOID** unless a specific recurring need for ad-hoc SQL exploration emerges; the existing Prisma/migration workflow is sufficient. |
| Redis | No | — | Low | Marginal | **AVOID** — `redis-cli` via Bash already available when needed. |
| Sentry | No | — | — | Would help production error triage, but no Sentry integration exists in the app itself yet | **OPTIONAL** — only relevant once/if the app itself adds Sentry. |
| Deployment provider | No | — | High (deploy actions) | Unknown — no deployment target is defined in-repo | **AVOID for now** — establish the actual deploy target first; adding deploy-capable tooling before that exists is premature and risky. |
| Search/research | Yes (native) | `WebSearch`/`WebFetch` | Low | Yes | **KEEP** — sufficient. |

Classification summary: **KEEP** native filesystem/search/browser tools and the two product-relevant skill directories; **AVOID** duplicating browser automation via the repo's inert MCP config; **ADD** GitHub only if/when the user wants direct PR/issue/CI inspection (needs explicit setup); everything else **OPTIONAL**, not installed now, per "minimum tooling complexity."

## 4. GitHub

- Remote configured: `origin` → `https://github.com/mohit11kmr/leadgardosv6new-top.git`.
- `gh` CLI: **not installed** in this environment.
- No GitHub MCP server configured or available.
- **Current capability: cannot inspect issues/PRs/CI checks directly.** `git log`/`git diff`/`git status`/`git branch` work normally (local git, not GitHub API). If GitHub inspection is needed, install `gh` and authenticate, or add a GitHub MCP server — neither was done in this phase (would require the user's explicit go-ahead and credentials).

## 5. Documentation retrieval

No Context7 or equivalent MCP configured. `WebSearch`/`WebFetch` (native, already available) cover the stated need (React/TypeScript/Express/Prisma/PostgreSQL/BullMQ/Redis/Playwright/Node docs) well enough that a dedicated MCP wasn't added — avoids running two overlapping documentation mechanisms per the "minimum tooling complexity" directive.

## 6. Playwright / browser testing

- Installed: `@playwright/test` (root devDependency), version confirmed at `1.62.1` via `npx playwright --version`. Chromium already downloaded (`~/.cache/ms-playwright/chromium-1234`).
- Config: `playwright.config.ts` (root), `testDir: tests/e2e`, boots both `apps/api` and `apps/web` dev servers itself against local Postgres/Redis.
- Existing specs: `tests/e2e/core.spec.ts`, `agency-hardening.spec.ts`, `phase8-platform.spec.ts`, `vaultguard.spec.ts`.
- **Gap confirmed**: `.github/workflows/ci.yml` does **not** run Playwright — only `npx vitest run`. E2E is developer-local-only currently; a green CI run is not evidence E2E passed.
- No existing Playwright MCP wired into Claude Code (see §3). The native `mcp__claude-in-chrome__*` tools serve ad-hoc live-browser verification; the `tests/e2e/*.spec.ts` suite serves regression coverage. Kept both, no duplicate system created.

## 7. Database (Prisma / PostgreSQL)

- Prisma: `^6.1.0` / `@prisma/client ^6.19.3` (per `npm audit` output; `packages/database/package.json` pins `^6.1.0`).
- Schema: `packages/database/prisma/schema.prisma`, 50+ models.
- Migrations: `packages/database/prisma/migrations/` — history was squashed once (commit `d966f05`, "C1/C2 rebaseline"); several incremental migrations exist beyond that baseline.
- Local dev DB: `docker-compose.yml` — Postgres on host port `15432`, Redis on `16380` (both non-default to avoid host collisions).
- No dedicated seed script beyond `npm run db:seed` (`packages/database/prisma/seed.ts` if present) — billing plans are seeded idempotently via `billingService.ensurePlansSeeded()`, called from `tests/global-setup.ts` for tests.
- **Established rule**: production database is read-only for Claude in this environment unless the user explicitly authorizes a specific write in-conversation. All migration commands documented in `.claude/skills/database/SKILL.md` target `localhost:15432` explicitly.

## 8. Redis / BullMQ

Queues (all defined/wired in `apps/worker/src/worker.ts`): `audit`, `monitoring`, `vault`, `report`, `webhook`, `agency-prospect`, `agency-competitor`, `agency-pitch`, plus a `setInterval`-based outbox-replay loop (not a BullMQ queue itself) that guarantees eventual webhook delivery for events that failed initial dispatch.

Debugging workflow (documented in `.claude/skills/queues/SKILL.md`):
```
API → Queue (BullMQ) → Redis → Worker → Scanner/Handler → Database
```

Known historical bug class in this codebase worth re-checking whenever a new recurring job is added: a fully-implemented, fully-tested job (`MonitoringScheduler`) existed but nothing ever called `.start()` on it, so it silently never ran in production despite passing its own unit tests. Fixed during this project's work, but the *pattern* (verify a job is actually invoked from `worker.ts`, not just defined) is now a standing check in `.claude/skills/queues/SKILL.md`.

## 9. Security tooling

No dedicated security scanning tooling found in-repo: no ESLint config (the `lint` script in every workspace is literally `tsc --noEmit`, same as `typecheck`), no Semgrep, no Dependabot, no CodeQL, no Gitleaks, no Snyk config.

`npm audit --omit=dev` (read-only check performed this phase): **3 high-severity findings**, all in `prisma`'s `deepmerge-ts` dependency chain (CLI/dev-tooling path, not confirmed to be in a runtime-shipped code path). Not fixed in this phase (would modify `package-lock.json`/dependencies — "Requires Review" per change-control policy).

Application-level security controls that *do* exist (verified from source, not assumed): SSRF guard (`packages/shared/src/url-security.ts`, used consistently across crawler/webhook/PDF-logo/guest-scan paths, re-validated on every redirect hop), org-scoped queries as the primary IDOR defense (consistent across ~100+ routes), Zod input validation on mutating routes, Argon2id password hashing, rotating refresh tokens with reuse detection, AES-256-GCM encryption for the one class of secret that must be recoverable (webhook signing keys — see `packages/shared/src/server-only/secret-encryption.ts`), Helmet security headers, Redis-backed rate limiting with spoofing-resistant IP detection (`TRUST_PROXY` gate).

Recommended minimal future addition (not installed in this phase): `npm audit` as an explicit CI step, and Dependabot for automated dependency-update PRs — both low-effort, high-value, and don't require new secrets/credentials to set up.

## 10. Claude skills (`.claude/skills/*/SKILL.md`)

Twelve skills added this phase, each concise (Purpose / When to use / Repository-specific rules / Workflow / Verification requirements / Failure conditions): `architecture`, `backend`, `frontend`, `database`, `queues`, `security`, `testing`, `browser-testing`, `api`, `ui-ux`, `performance`, `release`.

`ui-ux` is deliberately a pointer to the existing `.agents/skills/leadguard-*` product skills rather than a restatement — avoids maintaining two competing design contracts.

## 11. Claude agents (`.claude/agents/*.md`)

Nine narrow-responsibility agents added: `architect`, `backend-engineer`, `frontend-engineer`, `database-engineer`, `security-engineer`, `qa-engineer`, `browser-qa`, `code-reviewer`, `release-engineer`. None are configured to commit or push — every agent's instructions explicitly say so.

## 12. Claude commands (`.claude/commands/*.md`)

Fifteen commands added, each structured as INSPECT → ANALYZE → PLAN → IMPLEMENT (where applicable) → TEST → VERIFY → REPORT rather than "implement everything": `audit`, `deep-audit`, `architecture`, `security-audit`, `backend-audit`, `frontend-audit`, `database-audit`, `api-audit`, `ui-audit`, `test`, `e2e`, `review`, `simplify`, `performance`, `release`.

## 13. Testing workflow

- Unit/integration: Vitest, `vitest.config.ts` (`fileParallelism: false` — tests share DB/Redis state). Needs `docker compose up -d` first. `tests/global-setup.ts` truncates all tables once and seeds plans.
- A small number of tests are timing-sensitive and fail only under full-suite load (`Test timed out in 5000ms`) — confirmed during this project's own work to pass reliably in isolation; treat these as environmental, not regressions, until proven otherwise by an isolated re-run.
- E2E: Playwright, not run in CI (see §6).

## 14. Git safety

Protocol already in force for this session (see top-level system instructions, not repeated here): never force-push, `reset --hard`, or `git clean` without explicit authorization; always create new commits rather than amending; never skip hooks; stage specific files rather than `git add -A`.

## 15. Release workflow

See `.claude/skills/release/SKILL.md` and the `release-engineer` agent / `/release` command. No deployment target is defined in-repo (no Dockerfile for the apps themselves, no k8s/Terraform/Procfile) — this is a genuine gap to resolve with the user before any real release, not something Claude should assume.

## 16. Known gaps (as of this Phase 0 bootstrap)

- No deployment manifest/target defined in-repo for `apps/api`/`apps/web`/`apps/worker`.
- E2E (Playwright) not wired into CI.
- No ESLint — `lint` script is an alias for `typecheck`.
- No Dependabot/CodeQL/Semgrep/Gitleaks.
- 3 high-severity `npm audit` findings in the Prisma CLI's dependency chain, not yet triaged/fixed.
- `gh` CLI / GitHub MCP not available — no direct PR/issue/CI-check inspection capability in this environment currently.
- The repo's own `mcp_config.json` files are in the wrong format/location for Claude Code to load them — currently inert for this tool.

## 17. Recommended future improvements (not implemented this phase — proposals only)

- Add a real ESLint config (currently just an alias for `tsc`) if stricter static analysis is wanted beyond type-checking.
- Add Playwright to a CI job (or a separate scheduled workflow, given it's slower) so E2E coverage isn't purely developer-local.
- Add Dependabot for automated dependency-update PRs.
- Define an actual deployment target and add the corresponding manifest (Dockerfile/Procfile/IaC) before attempting a real release.
- If GitHub PR/issue/CI inspection becomes a recurring need, install `gh` and authenticate, or add a proper GitHub MCP server (with the user's explicit setup/credentials).

## 18. External tooling (Phase 0.5 — configured 2026-09-01)

Superseding §3/§4/§5's Phase 0 "not installed" status for GitHub and Playwright exploration. Nothing in this phase touched application code, the database, migrations, or `.env`; no commit/push was made.

| Tool | Purpose | Installed? | Scope | Authentication | Usage | Fallback |
|---|---|---|---|---|---|---|
| **GitHub MCP** (`ghcr.io/github/github-mcp-server` via Docker) | Repo/PR/issue/CI inspection from Claude Code | Yes — registered via `claude mcp add github -s user -e GITHUB_OAUTH_CALLBACK_PORT=8085 -- docker run -i --rm -p 127.0.0.1:8085:8085 -e GITHUB_OAUTH_CALLBACK_PORT ghcr.io/github/github-mcp-server` | User (`~/.claude.json`), not project — not committed, not shared via repo `.mcp.json` | OAuth device flow, triggered on first real tool call (no PAT stored or fabricated). `claude mcp list` shows transport-level "Connected"; actual GitHub API calls still require completing OAuth in a browser the first time a tool is used | Restart Claude Code so the new MCP server's tools load, then use the `github` MCP tools for PR/issue/CI reads | `git log`/`git diff`/`git status` (local-only) already work without this; `gh` CLI is still not installed system-wide if a shell-level GitHub CLI is ever wanted instead |
| **Context7** (`ctx7` CLI) | Up-to-date library documentation lookup | **Not completed** — requires interactive OAuth device-flow login, which is the user's action, not something to automate | N/A until login completes | OAuth device flow (`npx ctx7 login`) — attempted in this phase; the process blocks on browser approval, so it was not force-completed | Run `npx ctx7 login`, open the printed link, approve, then `npx ctx7 setup --claude --cli` (CLI + Skills mode, matches the token-efficient approach used for Playwright below) | `WebSearch`/`WebFetch` (native, already available) cover the same need today |
| **Playwright CLI + Skills** (`@playwright/cli`) | Token-efficient exploratory browser driving for Claude Code (distinct from the regression-test suite) | Yes — `npm install -g @playwright/cli@latest`; skill installed via `playwright-cli install --skills claude --global` | Global (`~/.claude/skills/playwright-cli`) — not written into the repo's `.claude/skills/`, no collision with existing skills | None needed | Claude Code auto-discovers the skill; the CLI drives a real Chromium (reuses the already-installed `~/.cache/ms-playwright/chromium-1234`) for ad-hoc exploration | Native `mcp__claude-in-chrome__*` tools (already available in-session) |
| **Playwright Test** | Deterministic E2E regression suite | Already existed — `@playwright/test@1.62.1`, `tests/e2e/{core,agency-hardening,vaultguard,phase8-platform}.spec.ts` | Repo (`playwright.config.ts`) | None | `npm run e2e` | — |
| repo's own `mcp_config.json` (`.agents/`, `.opencode/`) | — | Inert for Claude Code (wrong location/format — see §3) | — | — | — | Left untouched, per "preserve existing `.agents/`/`.opencode/` tooling" |
| PostgreSQL / Redis / Sentry / deployment-provider MCPs | — | Not installed | — | — | — | Bash + `psql`/`redis-cli`/Prisma CLI already cover current needs (see §3) |

No duplicate MCP servers, documentation providers, Playwright systems, GitHub integrations, skills, agents, or commands were created. `claude mcp list` after this phase: `hackerone` (pre-existing), `github` (new) — both showing "✔ Connected" at the transport level.
