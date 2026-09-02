# LEADGUARD V6
# ARCHITECTURE RESTRUCTURE BLUEPRINT

*Phase 1 — discovery and migration design only. No files moved, renamed, or deleted. No code, schema, dependency, or git-history changes were made to produce this document.*

| Field | Value |
|---|---|
| Repository | leadguard-os-v6 |
| Branch | main |
| HEAD | `907c504` |
| Method | Source-verified — actual imports, package.json dependency graphs, and file inventories, not documentation claims |
| Files moved | None |
| Code changed | None |

---

# TOP 15 ARCHITECTURAL CHANGES REQUIRED

| # | Priority | Current problem | Target solution | Reason | Risk |
|---|---|---|---|---|---|
| 1 | P0 | No dependency-boundary enforcement exists anywhere — `lint` is literally `tsc --noEmit` in every workspace, no ESLint/dependency-cruiser configured | Add a dependency-boundary linter (e.g. dependency-cruiser) encoding the rules in §22 | Every rule in this document is currently convention-only; nothing stops a future PR from importing `@leadguard/database` into `apps/web` tomorrow | Low — additive tooling, no code change |
| 2 | P0 | Admin console (`apps/web/src/features/admin/`) has no client-side role gate and only one server-side privilege bit (`platformAdmin`) | Internal role model + admin frontend physically separated, in that order | Highest-privilege surface in the system currently has the weakest structural isolation | Medium — auth-adjacent, sequencing matters (see §21) |
| 3 | P1 | `packages/database` is imported via the package name `@leadguard/database`, not a hardcoded path — folder location is decoupled from import correctness | Confirm this decoupling explicitly before any move, so `backend/database/` is a safe rename, not a refactor | This is the single fact that makes most of this migration mechanically low-risk | Low — this is a finding, not a change |
| 4 | P1 | `apps/api/src/services/` is a 31-file flat folder with only two informal sub-groupings (`agency/`, `public/`) | Extend the existing sub-folder pattern to every domain as it's touched, not as a rewrite | Cheapest boundary-fixing moment is when a service is next edited for its own reason | Low if incremental |
| 5 | P1 | `apps/web/src/app/App.tsx` is a single file holding all routing for both customer and admin surfaces | Split router entry per frontend once `frontend/admin` exists | A single router file is exactly where customer/admin coupling currently lives | Medium — depends on #2 happening first |
| 6 | P1 | No `packages/contracts` exists; `apps/web/src/api/*.ts` hand-writes fetch wrappers that match `apps/api/src/routes.ts` shapes only by convention | Introduce `packages/contracts` right before a second frontend (admin) is built | A second consumer is what actually prevents drift — building it for one consumer is premature abstraction | Low — additive package |
| 7 | P2 | Root `package.json` workspaces glob is `["apps/*","packages/*"]` — a physical folder rename requires this to change atomically with every workspace's location | Treat the workspace-glob edit and the folder move as one atomic, reviewed change, never incremental | A partial move breaks `npm install` resolution across the whole repo | Medium — must be a single well-tested commit, not a drip of moves |
| 8 | P2 | Zero infrastructure-as-code exists (no Dockerfile anywhere) despite six docs describing a production topology | Create `infra/` only when Phase 10 of the operating roadmap actually builds deployment (see companion blueprint, `docs/LEADGUARD_OS_BLUEPRINT.md`) | This is a "create new," not a "move" — don't manufacture `infra/` as an empty folder now | Low — sequencing note only |
| 9 | P2 | `tests/` is already organized by business domain (`tests/billing`, `tests/security`, `tests/agency`, …), not by test type | Keep the current domain-based top-level layout; do not force a `unit/integration/e2e` reshuffle | Forcing a type-based split would scatter tests that are currently easy to find by feature, for no verification benefit | Low — this is a "don't touch" finding |
| 10 | P2 | `apps/worker/src/audit/*.test.ts` and `apps/api/src/*.test.ts` are colocated with source, while cross-cutting tests live in top-level `tests/` | Preserve this two-tier convention (colocated unit tests + top-level integration/domain tests) explicitly in target design | It already works and matches the existing, deliberate split — not a gap | None — confirm, don't change |
| 11 | P2 | `backend/admin` is assumed as a folder name in the target sketch, but no evidence justifies a *separate deployable* admin backend today | Keep admin as a permission-scoped module inside `backend/core` (one Express instance, one Prisma pool), not a second backend service | A second backend app would duplicate auth/session infrastructure with no scaling justification | Low — this is a "do not build" finding |
| 12 | P3 | Repository root carries non-application clutter: `PPC_Mastery_Book.html` (72KB, unrelated content), `scratch/`, `test-results/`, `.opencode/` (a second agent-tool cache alongside `.claude/`/`.agents/`) | Flag for a separate cleanup decision; do not fold into this migration | Mixing repo hygiene into an architecture migration risks losing track of which changes are structural vs. janitorial | None yet — flagged only |
| 13 | P3 | `docs/` has 49 files with no subfolder structure at all | Introduce `docs/architecture/`, `docs/business/`, etc. only in the documentation-reconciliation phase, independent of code migration | Docs reorganize freely without touching any import graph — lowest-risk part of this whole plan, but shouldn't be rushed into this code-focused migration | Low |
| 14 | P3 | `apps/web/src/features/agency`, `billing`, `developer` each mix customer-usable and eventually-admin-relevant views in one folder | Do not split yet — nothing here is admin-only; agency/billing/developer are entirely customer/agency-facing today (see §5/§6) | Splitting now would separate code that has no current admin counterpart | None — a non-finding worth stating explicitly to prevent over-eager splitting |
| 15 | P4 | `packages/shared/package.json` declares zero dependencies, `packages/config` two, `packages/database` one — the dependency graph is already unusually clean for a repo this size | Preserve this discipline explicitly as a permanent rule (§22); it is the main reason this migration is low-risk at all | Worth calling out as a strength, not just a gap list | None — preserve |

---

## 1. Executive Verdict

The physical restructure this task asks about is **mostly unnecessary work disguised as risk-reduction, with one real exception**. The actual npm-workspace dependency graph — verified from every workspace's `package.json`, not from docs — is already exactly what a target architecture would want: `@leadguard/web` depends on nothing but `@leadguard/shared`; `@leadguard/shared` depends on nothing; `@leadguard/database` is import-only via its package name, never a hardcoded path; `@leadguard/api` and `@leadguard/worker` both depend on `config`+`database`+`shared` and nothing else. **Renaming `apps/`→`backend/`+`frontend/` and `packages/database`→`backend/database` changes labels on an already-correct graph — it does not fix anything currently broken.**

The one exception is real: the **admin surface has no physical, logical, or even client-side-enforced boundary** from the customer product, and the internal-permission model backing it is a single boolean. That is a genuine architectural gap, and it is the one place where "make this a separate thing" is not premature — but the fix is sequenced (internal RBAC first, physical extraction second), not a folder move.

**Recommendation:** do not execute the folder-rename migration in §20/§21 as a standalone project. Extend the existing, working sub-folder pattern (`services/agency/`, `services/public/`) domain-by-domain as those domains are next touched, add the one missing structural safeguard (a dependency-boundary linter, since none exists today), and reserve the full physical `backend/`+`frontend/` split for the moment `frontend/admin` actually needs to exist as its own deployable — which the companion business blueprint (`docs/LEADGUARD_OS_BLUEPRINT.md`, Phase 4) already conditions on internal RBAC shipping first.

---

## 2. Current Architecture Reality

Verified directly from each workspace's `package.json` (not from `docs/ARCHITECTURE.md`, which describes the shape correctly but was not used as a source of truth here):

| Path | Package name | Runtime | Depends on (workspace) | Depends on (external, notable) | Consumers |
|---|---|---|---|---|---|
| `apps/api` | `@leadguard/api` | Node/Express 5, ESM | `@leadguard/config`, `@leadguard/database`, `@leadguard/shared` | argon2, jsonwebtoken, ioredis, zod, helmet | `apps/web` over HTTP, external API clients |
| `apps/web` | `@leadguard/web` | Browser, React 19 + Vite 6 SPA | `@leadguard/shared` **only** | react-router-dom, @tanstack/react-query | End users (customer, agency, and — today — internal admin) |
| `apps/worker` | `@leadguard/worker` | Node, BullMQ 5 consumer | `@leadguard/config`, `@leadguard/database`, `@leadguard/shared` | bullmq, ioredis, playwright-core, @aws-sdk/client-s3, nodemailer | Nothing imports worker; it is a queue consumer only |
| `packages/database` | `@leadguard/database` | Node (Prisma) | — | `@prisma/client` only | `apps/api`, `apps/worker` |
| `packages/shared` | `@leadguard/shared` | Isomorphic (browser + Node, with a `server-only/` subpath) | — | zero runtime dependencies declared | `apps/api`, `apps/worker`, `apps/web` |
| `packages/config` | `@leadguard/config` | Node | — | dotenv, zod | `apps/api`, `apps/worker` (not `apps/web`) |

**Identified but out of scope for this migration:** `.opencode/` (a second, separate agent-tool package with its own `package.json`/`node_modules`, unrelated to the product workspaces), `scratch/`, `test-results/`, and `PPC_Mastery_Book.html` at repo root — none of these are part of the application dependency graph.

For every directory, purpose/customer-facing/internal-facing determination:

| Directory | Purpose | Customer-facing? | Internal-facing? | Should remain where it is? |
|---|---|---|---|---|
| `apps/api` | Core backend — 128 routes, all business services | Indirectly (serves the SPA) | Yes (also serves `/admin/*` routes) | Yes, as a workspace; internal folder structure should evolve incrementally |
| `apps/web` | Customer + agency SPA **and** the embedded admin console | Yes | Yes (unintentionally overlapping) | The customer portion: yes. The admin portion: no — should become its own frontend once RBAC backs it |
| `apps/worker` | Async job processing (8 BullMQ queues) | No (invisible to users) | Operationally, yes | Yes |
| `packages/database` | Prisma schema, migrations, client | No | Yes (infra for both api/worker) | Yes, location-wise; renaming is safe per Finding #3 |
| `packages/shared` | Scanner engines, SSRF guard, scoring, business-impact/whatsapp/intelligence logic | Indirectly | Indirectly | Yes |
| `packages/config` | Zod-validated env loading | No | Yes | Yes |
| `tests/` | Domain-organized integration/security/billing/etc. tests | No | No | Yes, structure is already sound (Finding #9/#10) |
| `docs/` | 49 flat markdown files | No | No | No — benefits from subfolders, independent of code migration |
| `scripts/` | One file: `uiux-browser-audit.cjs` | No | No | Yes, too small to restructure |
| `.github/` | One file: `workflows/ci.yml` | No | Yes | Yes |

---

## 3. Why Current Structure Will / Will Not Scale

**Will scale without change:** the dependency graph (§2) — it already enforces the most important rule (frontend never touches the database or config packages directly) without any tooling telling it to. The `services/agency/` and `services/public/` sub-folder precedent inside `apps/api` already shows the team knows how to carve a domain out when it's big enough to deserve one.

**Will not scale without change:** the admin surface. Every new internal-only feature (finance controls, ops console, feature flags — see the companion business blueprint) has nowhere to go except deeper into `apps/web/src/features/admin/` or `apps/api/src/services/adminService.ts`, both of which are gated by the same single `platformAdmin` boolean. This is a real structural ceiling, not a hypothetical one — it is the one part of §1's "already fine" verdict that does not hold.

**Will not scale, but for lack of tooling, not layout:** nothing currently stops a future contributor from importing `@leadguard/database` into `apps/web`. The graph is clean today by convention and small team size, not by enforcement (Finding #1). This degrades silently as the team grows, independent of any folder renaming.

---

## 4. Required Physical Boundaries

| Boundary | Currently enforced? | How |
|---|---|---|
| Customer frontend ↔ Backend | Yes | HTTP only; `@leadguard/web`'s package.json has no backend dependency |
| Customer frontend ↔ Database | Yes | No `@leadguard/database` dependency anywhere in `apps/web` |
| Admin frontend ↔ Backend | **No** — because there is no separate admin frontend yet; it shares `apps/web`'s boundary, which is correct for backend access but wrong for privilege isolation | N/A |
| Backend core ↔ Worker | Partial | Both are independent Node processes talking only through Redis/BullMQ + Postgres; no direct import of one by the other was found |
| Worker ↔ Database | Yes | Only via `@leadguard/database` package, same as api |
| Any layer ↔ enforcement tooling | **No** | No ESLint, no dependency-cruiser, no import-boundary check anywhere (Finding #1) |

---

## 5. Customer Frontend Architecture

Everything currently in `apps/web/src/features/` **except** `admin/` is genuinely customer/agency-facing, verified by content, not just folder name:

`agency/` (AgencyDashboardView, ClientViews, CompetitorViews, PitchModal, ProspectViews, WidgetViews), `audits/`, `auth/`, `billing/` (BillingView, ExpressFixCheckoutView), `dashboard/`, `developer/` (ApiKeysView, DeveloperDashboardView, WebhooksView), `landing/`, `legal/`, `monitoring/`, `reports/`, `scan/`, `security/` (VaultGuard UI), `settings/`, `testimonials/`, `websites/`. All of these are self-service, tenant-scoped views a paying customer or agency operator actually uses — none require a `platformAdmin` bit today. **None of this needs to move.**

---

## 6. Internal Admin Frontend Architecture

Currently: `apps/web/src/features/admin/` — exactly 4 files (`AdminDashboardView.tsx`, `AdminUsersView.tsx`, `AdminOrgsView.tsx`, `AdminAuditLogsView.tsx`), routed from the single `apps/web/src/app/App.tsx`, calling `GET /admin/metrics` and related endpoints in `apps/api/src/services/adminService.ts`.

**What should eventually live here, per the target admin surface defined in the companion business blueprint:** command center, customers/organizations/users management, revenue/billing/payments/refunds, plans/pricing/offers/coupons/campaigns, analytics, audit operations, queue/worker inspection, incidents, support, security operations, feature flags, employee/permission management, admin audit logs. Of these, **only customers/organizations/users management and audit-log viewing exist today** — everything else is a documented gap in the companion blueprint (G-05 through G-18 there), not something to physically relocate now because it doesn't exist yet.

**Recommendation on physical separation:** do not extract `frontend/admin` as a folder move today. The 4 existing admin views are too small to justify a second build pipeline, and — critically — extracting them without the internal-role model in place (§8) would produce a *second* unguarded admin surface instead of fixing the one that exists. Ship the immediate fix (a client-side role gate inside the current app) first; extract only once the admin feature set has grown enough, and the RBAC exists, to justify its own release cadence.

---

## 7. Backend Core Architecture

`apps/api/src` today, mapped against the requested domain list:

| Requested domain | Exists today as | Notes |
|---|---|---|
| auth | `auth.ts`, `authSecurityService.ts` | Real |
| organizations | inside `routes.ts` + Prisma `Organization`/`OrganizationMember` | No dedicated service file — logic lives in route handlers |
| customers | same as organizations — no separate concept | Distinct from "Organization" only in the business-blueprint sense (§03 there); not a code-level split today |
| websites | inside `routes.ts` | No dedicated service file found |
| audits | `services/reportService.ts` + worker-side `audit/` | Split across api (CRUD/read) and worker (execution) — correct split, not a gap |
| scanner | lives in `packages/shared/src/scanners/` | Correctly shared, not backend-core-owned |
| vaultguard | `packages/shared/src/vault/` + `apps/worker/src/audit/vaultRunner.ts`/`vaultScan.ts` | Same pattern as scanner |
| monitoring | `services/monitoringService.ts` (api) + `apps/worker/src/monitoring/` (worker) | Correct split |
| reports | `services/reportService.ts`, `services/public/publicReportService.ts` | Real |
| billing | `billing/` folder (`razorpayProvider.ts`, `types.ts`) + `services/billingService.ts`, `services/billingReconciliationService.ts` | Already has its own top-level folder — the precedent to extend |
| plans / pricing | inside `Plan` model + `entitlementService.ts` | Conflated per companion blueprint G-11; not a folder problem |
| offers / coupons / campaigns | **do not exist** | Nothing to move — build inside `billing/` when created (see companion blueprint Phase 7) |
| analytics | `services/funnelEventService.ts` | Real but thin |
| agency | `services/agency/` (6 files) | Already its own sub-folder — the other precedent to extend |
| prospects | `services/agency/prospectService.ts` | Inside agency, correctly |
| developer | `services/apiKeyService.ts` + webhook services | No dedicated folder; small enough that it may not need one |
| notifications | `apps/worker/src/monitoring/notifications/` | Worker-owned, correct |
| support | **does not exist** | Nothing to move |
| security | `security.ts` (middleware/headers), `authSecurityService.ts`, `redactService.ts` | Split between transport-security and auth-security; a unified `security/` domain folder would only make sense once incident-tracking (companion blueprint G-06) is built |
| operations | **does not exist** as a domain (ops console) | Nothing to move |
| admin | `services/adminService.ts` (1 file) | Small; see §6 |
| public | `controllers/public/` (6) + `services/public/` (6) | Already its own consistent sub-folder pair — a third precedent to extend |

**Pattern already established, worth stating explicitly:** `billing/`, `services/agency/`, and `services/public/`+`controllers/public/` are three independent, already-working examples of "give a domain its own folder when it earns one." The target architecture for `backend/core` is this same pattern applied consistently, not a new convention.

---

## 8. Worker Architecture

`apps/worker/src` maps cleanly to five real domains, already folder-separated:

| Folder | Job types | Belongs in target `backend/worker`? |
|---|---|---|
| `agency/` | competitorWorker, pitchWorker, prospectWorker | Yes, unchanged |
| `audit/` | crawler, fetcher, orchestrator, finalizer, aggregation, persistence, telemetry, renderedFetch, vaultRunner, vaultScan, guestScanNotifier | Yes, unchanged — this is the largest and most central module |
| `monitoring/` | alertEngine, cleanup, healthChecker, processor, regressionEngine, scheduler, `notifications/emailProvider` | Yes, unchanged |
| `report/` | pdfWorker | Yes, unchanged |
| `webhook/` | outboxReplay, vaultWebhookEmitter, webhookWorker | Yes, unchanged |
| `worker.ts` (root) | Queue registration / process entrypoint | Yes, unchanged |

No worker module needs to move. The one real worker-side gap (per the companion blueprint: monitoring/retention jobs coded but never invoked, no dead-letter queue, no ops console) is a **behavioral** gap, not a structural one — it does not require a folder change to fix.

---

## 9. Database Architecture

`packages/database` contains only `prisma/` (schema + 4 migrations: `20260831000000_rebaseline`, `20260901093401_add_blog_post`, `20260901101542_add_vault_run_verified_findings`, `20260901152823_add_audit_guest_email`), `src/` (the client wrapper), and a build `dist/`. Its `package.json` declares exactly one dependency: `@prisma/client`. This is already a textbook-clean "only Prisma" package — nothing needs to be removed from it, and nothing outside it currently touches Prisma directly (both `apps/api` and `apps/worker` import the compiled `@leadguard/database` package, never the `prisma/` folder path).

**Can it move to `backend/database` safely?** Yes, mechanically — per Finding #3, the import is by package name (`@leadguard/database`), resolved through the npm workspaces mechanism, not a relative path. The real risk is not in application code; it is in anything that references the *folder path* directly: `docker-compose.yml` (does not currently reference it), CI (`prisma generate`/`db push` run via npm scripts, package-name-addressed, not path-addressed), and any documentation. A move is a workspace-glob + path-reference change, not a refactor.

---

## 10. Shared Package Architecture

`packages/shared/src` — verified contents: `auto-fix`, `business-impact`, `claim-validator`, `evidence`, `pagination`, `priority`, `registry`, `request-utils`, `scoring`, `types`, `url`/`url-security`, `whatsapp-link-tool`, `vault-remediation`, plus sub-folders `intelligence/` (funnel, scenarios, whatsapp-optimizer), `scanners/` (cart, forms, mixed-content, opengraph, security-headers, seo, telephone, tls, tracking, tracking-page, whatsapp), `vault/` (auth-guard, debug-exposure, exposed-asset, registry, security-headers, ssl-health, types), and `server-only/` (`pinned-fetch`, `secret-encryption` — both correctly excluded from the main barrel per the earlier browser-safety audit).

**Everything here is legitimately shared** — scanner/scoring/business-impact logic runs identically whether triggered from the guest-scan path in `apps/api` or the full audit path in `apps/worker`, and `packages/web` needs the scoring/vault type definitions to render results. **Nothing was found that should NOT be shared** — the one thing that must never leak (Node-only crypto) is already correctly isolated behind the `server-only/` subpath, and `packages/shared/package.json` declaring zero dependencies confirms nothing Node-specific has quietly crept into the main barrel.

---

## 11. Monorepo / Workspace Design

**Should it remain npm workspaces?** Yes. There is no evidence of a workspace-tooling limitation (no complaints about install speed, no need for Turborepo-style task caching visible in scripts) — `concurrently` for dev and `npm run build --workspaces --if-present` for prod are simple and working. Introducing Nx/Turborepo now would add tooling complexity to solve a problem (build speed at scale) that hasn't appeared yet.

**Future workspace list**, if/when the physical split happens:

```
backend/core        (was apps/api)
backend/worker       (was apps/worker)
backend/database     (was packages/database)
frontend/customer    (was apps/web, admin/ removed)
frontend/admin       (new, extracted from apps/web/src/features/admin)
packages/shared
packages/contracts   (new)
packages/config
```

**Is this superior to today's `apps/*`+`packages/*`?** Only once `frontend/admin` and `packages/contracts` actually exist — renaming `apps/`→`backend/`+`frontend/` before either of those exists changes four working folder names for a purely cosmetic gain. The workspace-list change is real value only at the moment there are two frontends and two "backend-shaped" things worth grouping under one label.

---

## 12. Deployment Boundaries

| App | Deploy independently? | Scale independently? | Own env vars? | Own build? | Own CI job? | Own domain? | Own failure boundary? |
|---|---|---|---|---|---|---|---|
| Customer frontend (`apps/web`) | Architecturally yes (static SPA, own Vite config) — operationally no deploy pipeline exists at all | Yes (CDN-servable) | Only `API_URL`/`APP_URL` (build-time) | Yes (`vite build`) | No — CI runs typecheck/test/build for all workspaces together | Would need one assigned | Yes — a web crash doesn't touch api/worker |
| Admin frontend (future) | N/A — doesn't exist as a separate artifact | N/A | Would need its own, once real | N/A | N/A | Would need its own subdomain, distinct from customer | Should be yes — a compromised admin session should not be able to affect the customer app's runtime |
| Core API (`apps/api`) | Architecturally yes — no Dockerfile exists today | Yes (stateless behind a load balancer, in principle) | Full set, validated via `packages/config` | Yes (`tsc` build) | No dedicated deploy job | Would need one | Yes vs. worker (separate process) |
| Worker (`apps/worker`) | Architecturally yes — no Dockerfile exists today | Yes (BullMQ concurrency is horizontally scalable) | Subset of api's (config package is shared) | Yes | No dedicated deploy job | N/A (no HTTP surface) | Yes vs. api |
| Database (Postgres) | N/A (managed service target, not deployed from this repo) | N/A | `DATABASE_URL` | N/A | N/A | N/A | Single point of failure today — no replicas (documented gap in companion blueprint, §08 there) |
| Redis | N/A | N/A | `REDIS_URL` | N/A | N/A | N/A | Single instance shared by all queues — same shared-failure-domain note as the companion blueprint's future-scale test |

This table matches the companion blueprint's §01/§02 finding exactly: **the boundaries are architecturally real (clean dependency graph) but operationally nonexistent (zero deploy artifacts)**. Nothing in this restructure closes that — it is a deployment-infrastructure gap, not a repository-layout gap, and should be solved by the companion blueprint's Phase 10, not by moving folders.

---

## 13. Security Boundaries

Dependency-direction rules, verified against what's actually importable today versus what should never become importable:

```
apps/web (customer)     ──HTTP only──▶  apps/api
apps/web (customer)     ────────────✕  apps/api internals (services/, dtos/)
apps/web (customer)     ────────────✕  packages/database
apps/web (admin views)  ──HTTP only──▶  apps/api /admin/* routes   (today: same trust boundary as customer — the gap)
future frontend/admin   ──HTTP only──▶  backend/core admin module ✅ (target)
future frontend/admin   ────────────✕  packages/database
apps/worker             ────────────✕  apps/api route/controller implementation (confirmed: no such import found)
apps/api                ──package────▶  packages/database, packages/shared, packages/config
apps/worker              ──package────▶  packages/database, packages/shared, packages/config
packages/shared          ────────────✕  packages/database, packages/config  (confirmed: zero dependencies declared)
```

Everything on the "✕" lines above is **currently true by convention/absence**, not by enforcement (Finding #1) — this is the diagram to encode into a dependency-cruiser config, not just a document to file away.

---

## 14. Testing Structure

Current reality: `tests/` is already domain-organized (`tests/admin`, `tests/agency`, `tests/billing`, `tests/developer`, `tests/e2e`, `tests/monitoring`, `tests/outbox`, `tests/reports`, `tests/security`, `tests/settings`, `tests/testimonials`, `tests/webhooks`, plus `tests/fixtures/` — 33 scanner-fixture sites), while true unit tests are colocated with source (`apps/api/src/security.test.ts`, `apps/api/src/server.test.ts`, `apps/worker/src/audit/*.test.ts`, `packages/shared/src/**/*.test.ts`, `packages/config/src/boot-validation.test.ts`).

**Recommendation: do not impose a `unit/integration/security/e2e/frontend/backend/fixtures` reshuffle.** The current two-tier convention (colocated unit tests next to the code they test + domain-named integration folders at the root) already maps every test to an obvious home, and reshuffling by test-type would scatter tests that are currently easy to find by feature. The only structural test change worth making is mechanical: if/when `backend/core`, `backend/worker`, etc. are physically created, the top-level `tests/` folder's *domain* names (billing, security, agency…) don't need to change at all — they already match business domains, not current folder paths.

---

## 15. Company Operations Structure

Cross-referencing the companion business blueprint's control-plane inventory against code-level homes:

| Capability | Home today | Target home |
|---|---|---|
| Finance / revenue | `apps/api/src/billing/`, `services/billingService.ts` | `backend/core/billing/` (extend in place) |
| Offers / coupons / campaigns | Does not exist | `backend/core/billing/` (new sub-modules, not a new top-level domain) |
| Events | Does not exist (only `ProspectCampaign`, a sales-outreach concept) | Same as offers/campaigns, once built |
| Analytics | `services/funnelEventService.ts` | `backend/core/analytics/` once it grows past one service file |
| Support | Does not exist | New — `backend/core/support/` when built |
| Operations (ops console) | Does not exist | New — `backend/core/operations/` when built, gated by internal RBAC |
| Security (incident tracking) | `security.ts`, `authSecurityService.ts`, `SecurityEvent` model (used for one event type) | `backend/core/security/` once incident coverage expands (companion blueprint G-06) |
| Audit logs | `AdminAuditLog` model + `adminService.recordAdminAction` | Stays in `backend/core/admin/` — already correctly scoped |
| Feature flags | Does not exist | New — small enough to live in `backend/core/admin/` rather than earning its own top-level domain immediately |
| Reconciliation | `services/billingReconciliationService.ts` | Stays inside `backend/core/billing/` — it is a billing sub-capability, not its own domain |
| Incident management | Does not exist | New — pairs with security/operations, not its own domain until it has more than one concern |

---

## 16. Documentation Structure

`docs/` currently holds 49 files flat, no subfolders. Proposed mapping (illustrative — do not move now):

| Proposed folder | Existing files that would move there |
|---|---|
| `docs/architecture/` | ARCHITECTURE.md, CLAUDE_ENGINEERING.md, MULTI_TENANCY.md, ROADMAP.md, FEATURE_REGISTRY.md, LEADGUARD_OS_BLUEPRINT.md, ARCHITECTURE_RESTRUCTURE_BLUEPRINT.md (this file) |
| `docs/product/` | PHASE_2A/2B/2C*, PHASE_3A*/3B*, UX_GUIDELINES.md, VAULTGUARD_ROADMAP.md |
| `docs/business/` | ENTITLEMENTS.md |
| `docs/billing/` | BILLING.md, RAZORPAY.md |
| `docs/security/` | SECURITY.md, THREAT_MODEL.md, RBAC.md, AUTH.md |
| `docs/operations/` | PRODUCTION_OPERATIONS.md, PRODUCTION_READINESS.md, PRODUCTION_INFRASTRUCTURE.md, BACKUP_RECOVERY.md, LAUNCH_RUNBOOK.md, LAUNCH_CHECKLIST.md, OBSERVABILITY.md, QUEUES.md |
| `docs/api/` | API.md, PUBLIC_API.md, EXTERNAL_PROVIDERS.md |
| `docs/analytics/` | (none exist dedicated yet — placeholder for companion blueprint's analytics work) |
| `docs/runbooks/` | DEPLOYMENT.md, DEVELOPMENT.md, DATABASE.md, DATABASE_MIGRATIONS.md |

This is entirely additive and import-graph-free — it can happen at any time independent of the code migration, and is the lowest-risk item in this entire document. It should still wait for the doc-reconciliation phase (companion blueprint Phase 1) rather than happening as a side effect of this migration, so the two efforts don't collide mid-flight.

---

## 17. Infrastructure Structure

Currently: `docker-compose.yml` (local Postgres:15432 + Redis:16380 only — no `api`/`worker`/`web` service definitions) and `.github/workflows/ci.yml` (test/build only, no deploy stage). **No Dockerfiles, no k8s manifests, no Terraform, no Procfile exist anywhere.**

Proposed `infra/` shape — justified only, per the instruction not to propose unjustified structure:

```
infra/
├── docker/         one Dockerfile per deployable (core, worker, web, admin) — currently zero exist
├── deployment/     the actual deploy target's manifest (Fly.io/Render/compose-for-prod) — currently zero exist
├── ci/             deploy-stage additions to the existing ci.yml — currently the pipeline stops at build
└── environments/   per-env config references — currently only .env.example exists
```

`monitoring/` and `backups/` subfolders are **not proposed** — there is no monitoring stack or backup mechanism in this repo to hold configuration for yet (per the companion blueprint's G-03/G-07); adding empty folders for infrastructure that doesn't exist would be scaffolding without substance.

---

## 18. Current → Target Mapping

| Current Path | Target Path | Action | Reason | Risk | Dependencies |
|---|---|---|---|---|---|
| `apps/api` | `backend/core` | LATER | Rename only; no internal content change needed yet | Medium (workspace glob + tooling refs) | Must happen atomically with root `package.json` workspaces glob |
| `apps/api/src/services/` (flat 31 files) | Same, sub-foldered per domain | LATER, incremental | Extend existing `agency/`/`public/` precedent domain-by-domain | Low if done one domain at a time | None — purely additive folder creation |
| `apps/worker` | `backend/worker` | LATER | Rename only | Medium (same glob dependency as api) | Same atomic-move constraint |
| `packages/database` | `backend/database` | LATER | Rename only — package-name-based imports make this mechanically safe (Finding #3) | Low, mechanically; Medium for CI/doc references | Workspace glob update |
| `packages/shared` | `packages/shared` | NO CHANGE | Already correctly shared and isolated | None | — |
| `packages/config` | `packages/config` | NO CHANGE | Already minimal and correctly scoped | None | — |
| `apps/web/src/features/*` (except `admin/`) | `frontend/customer/src/features/*` | LATER | Rename only | Medium (glob dependency) | Same atomic-move constraint |
| `apps/web/src/features/admin/` (4 files) | `frontend/admin/src/features/*` | LATER, conditional | **Do not move until internal RBAC exists** (§6) — moving the folder without the permission model just relocates the same gap | Medium-high if done prematurely (false sense of separation); Low once RBAC backs it | Companion blueprint Phase 4 (internal RBAC) must land first |
| `apps/web/src/app/App.tsx` | Split into `frontend/customer/src/app/App.tsx` + `frontend/admin/src/app/App.tsx` | LATER, conditional | Same dependency as above | Medium | Depends on admin extraction above |
| `packages/contracts` (does not exist) | `packages/contracts` | LATER (create new) | Build once a second frontend needs shared types with `apps/api` | Low — additive | Should exist by the time `frontend/admin` is extracted, not before |
| `tests/*` (domain-organized) | `tests/*` | NO CHANGE | Already sound (§14) | None | — |
| `docs/*.md` (flat) | `docs/<category>/*.md` | LATER | Purely organizational, zero code risk | Low | Independent of code migration — do in the doc-reconciliation phase |
| `scripts/uiux-browser-audit.cjs` | `scripts/` (unchanged) | NO CHANGE | Single file, too small to restructure | None | — |
| `.github/workflows/ci.yml` | `.github/workflows/ci.yml` (extended, not moved) | LATER | Add a deploy stage once `infra/` exists | Low | Depends on §17 / companion blueprint Phase 10 |
| `docker-compose.yml` | Same path, extended | LATER | Add real `api`/`worker`/`web` service definitions once Dockerfiles exist | Low | Depends on §17 |
| `PPC_Mastery_Book.html`, `scratch/`, `test-results/`, `.opencode/` | Unclear — not part of the application | LATER, separate decision | Out of scope for an architecture migration; needs its own owner decision | None (informational only) | Not a code-migration dependency at all |

---

## 19. Final Target Repository Tree

```
leadguardv6/
├── backend/
│   ├── core/                    (was apps/api)
│   │   └── src/
│   │       ├── auth.ts, routes.ts, queue.ts, openapi.ts, security.ts, server.ts
│   │       ├── middleware/       (rbac.ts, rateLimiters.ts)
│   │       ├── dtos/
│   │       ├── billing/          (existing precedent — extend with offers/coupons/campaigns)
│   │       ├── controllers/public/
│   │       ├── services/
│   │       │   ├── agency/       (existing precedent)
│   │       │   ├── public/       (existing precedent)
│   │       │   ├── admin/        (grows here once internal RBAC exists)
│   │       │   └── security/     (new home once incident coverage expands)
│   │       └── scripts/
│   │
│   ├── worker/                   (was apps/worker — unchanged internally)
│   │   └── src/
│   │       ├── agency/ · audit/ · monitoring/ · report/ · webhook/
│   │       └── worker.ts
│   │
│   └── database/                 (was packages/database — unchanged internally)
│       ├── prisma/
│       └── src/
│
├── frontend/
│   ├── customer/                 (was apps/web, admin/ removed)
│   │   └── src/
│   │       ├── api/ · app/ · components/
│   │       └── features/ (agency, audits, auth, billing, dashboard, developer,
│   │                       landing, legal, monitoring, reports, scan, security,
│   │                       settings, testimonials, websites)
│   │
│   └── admin/                    (NEW — extracted from apps/web/src/features/admin,
│                                    only after internal RBAC exists)
│       └── src/
│           └── features/ (dashboard, users, organizations, audit-logs, ...grows here)
│
├── packages/
│   ├── shared/                   (unchanged)
│   ├── contracts/                 (NEW — created alongside frontend/admin)
│   └── config/                   (unchanged)
│
├── infra/                        (NEW — created in companion blueprint's Phase 10, not here)
│   ├── docker/ · deployment/ · ci/ · environments/
│
├── tests/                        (unchanged — already domain-organized)
├── docs/                         (subfoldered independently — see §16)
├── scripts/                      (unchanged)
├── .github/                      (unchanged path, extended content)
│
├── CLAUDE.md · README.md · .env.example · package.json  (workspaces glob updated atomically)
```

---

## 20. Migration Order

Derived from the actual dependency graph in §2, not assumed:

```
1. packages/contracts        — create new, zero existing dependents to break
2. packages/database rename  — safest first move: package-name-addressed everywhere (Finding #3)
3. packages/shared, packages/config — NO CHANGE (confirms nothing breaks by leaving them alone)
4. backend/database, backend/core, backend/worker renames — atomic with root workspaces glob update
5. frontend/customer rename (apps/web minus admin/) — after backend renames, so its build references resolve against the new package layout
6. Internal RBAC ships (companion blueprint Phase 4) — GATE: nothing below this line should happen before this
7. frontend/admin extraction — only after step 6
8. tests/ — no move needed at any point (already correctly organized)
9. .github/CI path updates — after steps 1-7 land, to point at new paths
10. docs/ subfoldering — fully independent, can happen at any point, including before step 1
```

The one **hard gate** in this order is step 6 → step 7: extracting the admin frontend before the internal role model exists is explicitly the wrong order (§1, §6, Finding #2).

---

## 21. Migration Risks

| Risk | Cause | Impact | Mitigation | Migration dependency |
|---|---|---|---|---|
| Partial workspace-glob update breaks `npm install` repo-wide | Root `package.json`'s `workspaces: ["apps/*","packages/*"]` must match actual folder locations exactly | Every workspace fails to resolve, blocking all development | Treat the glob edit + all folder moves it covers as one atomic commit, tested with a full `npm install` + `npm run build --workspaces` before merge | Step 4/5 in §20 |
| Admin extracted before internal RBAC exists | Treating "separate folder" as equivalent to "separate security boundary" | A second, still-ungated admin surface — the exact problem restated, not fixed | Enforce the gate explicitly (§20 step 6→7); do not let "we already renamed folders" create pressure to extract admin early | Companion blueprint Phase 4 |
| CI/tooling references a hardcoded path that changes | `docker-compose.yml`, doc cross-references, IDE configs may reference `apps/api` etc. by literal path | Silent CI breakage or stale documentation | Grep for every literal `apps/` / `packages/database` path reference (not just import statements) before any rename lands | Step 4/9 in §20 |
| Reorganizing `services/` by domain introduces import cycles | Cross-domain calls exist today inside a flat folder without a boundary to violate | A previously-invisible circular dependency surfaces once folders are split | Do one domain extraction at a time, run `tsc --noEmit` + the full test suite after each, not after a batch | Step 4 in §20, ongoing |
| Team treats this document as authorization to start moving files | Long, detailed migration documents can be misread as a green light | Violates the explicit no-code/no-file-move instruction for this phase | This document ends with an explicit "STOP" and requires separate approval per phase — restate this at handoff | N/A — process risk, not technical |

---

## 22. Rules That Must Be Permanent

```
Frontend cannot access the database directly (Prisma or otherwise).
Admin frontend cannot access the database directly, even once it exists as its own app.
Frontend cannot import backend service/controller implementation — HTTP only.
Backend core cannot import frontend code.
Worker cannot import API route/controller implementation (confirmed true today — keep it true).
packages/shared must declare zero dependencies on packages/database or packages/config.
Node-only code (crypto, fs, etc.) inside packages/shared must live behind the server-only/ subpath convention, never the main barrel.
Business logic (scoring, scanning, entitlement evaluation) must not be duplicated between apps/api and apps/worker — packages/shared is the only home for logic both need.
Financial state changes must go through the billing domain — no service outside billing/ writes to Payment/Invoice/Subscription tables.
Admin mutations must be permission-controlled and produce an AdminAuditLog entry — no exceptions for "small" admin actions.
Every authenticated query must filter by organizationId from verified JWT claims, never a client-supplied value (existing rule from CLAUDE.md — repeated here because it is the primary tenant-isolation defense and must survive any restructure unchanged).
The workspace dependency graph (§2) must be checked by tooling (Finding #1), not left to convention, the moment more than one additional engineer joins the project.
```

---

## 23. Future Company Test

| Growth dimension | Can the proposed structure absorb it without another major restructure? |
|---|---|
| More customers | Yes — nothing in this migration touches customer-facing scale characteristics |
| More employees (internal users) | Yes, **conditional on** the internal RBAC model landing before the admin surface grows further (§6, §20 gate) |
| More plans | Yes — stays inside `backend/core/billing/` |
| More offers / campaigns | Yes — same billing sub-domain, no new top-level folder needed |
| More integrations | Yes — new external providers are additions to existing `services/` or `billing/`, not new domains |
| More workers / scanners | Yes — `backend/worker`'s existing five-folder split (agency/audit/monitoring/report/webhook) already accommodates new scanner types inside `audit/` and `packages/shared/scanners/` without restructuring |
| More analytics | Yes, once `analytics/` graduates from one file to its own folder — already anticipated in §15 |
| More admin modules | Yes — but **only** once `frontend/admin` + internal RBAC exist; before that, "more admin modules" means "more unguarded features on the single `platformAdmin` bit," which is the one thing this document says not to keep doing |

---

## 24. Top Risks

Consolidated from §21, ranked by consequence:

1. **Risk:** Extracting admin before RBAC exists. **Cause:** treating folder separation as security separation. **Impact:** false confidence in a still-unguarded surface. **Mitigation:** hard sequencing gate (§20). **Migration dependency:** companion blueprint Phase 4.
2. **Risk:** Atomic workspace-glob change done incrementally instead of as one commit. **Cause:** underestimating that `npm install` resolves the *entire* workspace list at once. **Impact:** repo-wide broken installs. **Mitigation:** single reviewed commit, full build+test before merge. **Migration dependency:** none — a discipline issue, not a technical blocker.
3. **Risk:** This document itself being read as implementation authorization. **Cause:** its own thoroughness. **Impact:** violates the explicit "discovery only" instruction. **Mitigation:** the STOP notice at the end of this document, restated at handoff.
4. **Risk:** Losing the currently-clean dependency graph while restructuring. **Cause:** folder moves are exactly the moment stray imports get introduced "just to make the build pass." **Impact:** the one genuine strength identified in §1 quietly erodes. **Mitigation:** the dependency-boundary linter from Finding #1 should exist *before* any physical move, not after — it should catch regressions during the migration itself, not just after.

---

## 25. Things We Must NOT Move

- `packages/shared`, `packages/config` — already correctly scoped and minimal; touching them is pure risk with zero benefit (§10).
- `tests/` — already domain-organized correctly; a type-based reshuffle would scatter, not clarify (§14).
- Anything inside `apps/web/src/features/` except `admin/` — all of it is genuinely customer/agency-facing today, verified by content (§5).
- `packages/database`'s internal structure (`prisma/`, `src/`) — only its parent folder location is a rename candidate; nothing inside it needs reorganizing (§9).
- `scripts/uiux-browser-audit.cjs`, `.github/workflows/ci.yml` — too small/singular to restructure; extend in place when needed (§17).

## 26. Things We Must NOT Build Yet

- `frontend/admin` as a physical, separately-deployed application — not until internal RBAC exists (§6, hard gate in §20).
- `backend/admin` as a **separate backend service** — recommendation is a permission-scoped module inside `backend/core`, never its own deployable (Finding #11).
- `infra/monitoring/`, `infra/backups/` subfolders — nothing exists yet to configure there (§17).
- A repository-wide `unit/integration/e2e` test reshuffle — the current domain-based layout is already correct (§14, §25).
- Nx/Turborepo or any workspace-tooling upgrade — no evidence of a build-speed or task-orchestration problem npm workspaces can't already handle (§11).
- `packages/contracts` before a second frontend consumer exists — building it for one consumer today would be premature abstraction (Finding #6).

---

## Final Recommendation

Do not execute §19/§20 as a standalone "repository restructure" project. The dependency graph verified in §2 is already correct; renaming folders around it changes labels, not risk. The one real, time-sensitive action is sequencing-dependent, not folder-dependent: ship the internal RBAC model, then — and only then — extract `frontend/admin` as its own workspace with `packages/contracts` alongside it. Everything else in this document (domain sub-folders inside `apps/api/src/services/`, a dependency-boundary linter, documentation reorganization) can and should happen incrementally, each time its own trigger condition is actually met, exactly as the companion business blueprint's phased roadmap already stages it.

---

## FINAL INTEGRITY CHECK

```
$ git status --short
?? docs/LEADGUARD_OS_BLUEPRINT.md
?? docs/ARCHITECTURE_RESTRUCTURE_BLUEPRINT.md   (this file, newly written)

$ git diff --check
(clean — no output, no tracked file was touched)

Files moved:          NO
Files modified:       NO   (only new documentation files added, nothing existing changed)
Code changed:         NO
Schema changed:       NO
Dependencies changed: NO
Commit:               NO
Push:                 NO
PR:                   NO
```

**STOP after this report. Do not implement anything until this blueprint is reviewed and approved.**
