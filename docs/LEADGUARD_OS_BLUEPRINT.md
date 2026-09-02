# The LeadGuard OS Blueprint

**Master R&D + Company Architecture Discovery**
What LeadGuard actually is today, verified line-by-line against its own code — and the target architecture, business control plane, and phased roadmap for what it needs to become to run as a real company. No files were changed to produce this document.

| Field | Value |
|---|---|
| Repository | leadguard-os-v6 |
| Branch | main @ 907c504 |
| Date | 2026-09-01 |
| Method | Source-verified, read-only |
| Code changed | None |
| Status | For review |

---

## 00. Executive summary

Five independent, read-only research passes verified every major claim in this repository's own documentation against its actual source code, schema, and CI configuration. This section is the short version; every number below is cited with a file path later in the document.

### What LeadGuard sells

LeadGuard OS V6 is a multi-tenant SaaS platform that audits a customer's website for **lead-leakage** issues (broken tracking pixels, missing SEO/meta tags, insecure headers, exposed debug files, TLS problems, missing WhatsApp/tel CTAs) under the LeadGuard brand, and for security bugs under a second brand, **VaultGuard**. Findings are scored, turned into shareable reports, offered as ongoing monitoring ("Watchdog"), and wrapped in agency/white-label tooling so marketing agencies can run the same audits against their own prospects and clients. Billing runs through Razorpay, in INR/paise, reflecting an India-first go-to-market. Recurring revenue comes from paid tiers (Pro/Agency-style subscriptions); one-time revenue comes from "Express Fix" report unlocks and agency add-ons.

### The one-line verdict

The **customer-facing product** (audits, reports, monitoring, agency tooling, billing, RBAC, SSRF-safe scanning) is genuinely mature — 50 Prisma models, 128 API routes, a production-polished React SPA, and a security posture (SSRF pinning, org-scoped IDOR defense, encrypted webhook secrets) that most seed-stage SaaS companies do not have this early. The **company-operating side** — internal roles beyond a single admin bit, a commerce engine (offers/coupons/campaigns), real deployment infrastructure, observability, and incident response — is almost entirely undocumented-as-code: it exists as aspirational prose in `docs/`, not as working systems. The gap is not "the product is broken" — it's "the company cannot yet run itself without an engineer in the loop for anything past the current feature set."

> **Scope discipline.** Per the operating instructions for this phase, nothing in this document reflects a code change — it is 100% discovery, verification, and planning. Git status at both the start and end of this work is unmodified; see §18.

---

## 01. Reality check — documentation vs. code

For every major claim across five domains, the verdict below was reached by reading the actual implementation, not by trusting the corresponding doc. **REAL** = implemented and working as described. **PARTIAL** = exists but narrower/weaker than documented. **MISSING** = documented or expected, not implemented. **UNCONFIRMED** = infrastructure assumed by docs, unverifiable from source alone.

### Architecture & deployment

| Claim | Verdict | Evidence |
|---|---|---|
| Separate admin/control-plane application | **MISSING as an app** | No `apps/admin`. Admin is a route-tree inside `apps/web/src/features/admin/` + `apps/api/src/services/adminService.ts` — one bundle, one deploy, gated only by a boolean. |
| `packages/shared` stays browser-safe | **REAL** | `packages/shared/src/index.ts:18-23` explicitly excludes `secret-encryption.ts` from the barrel with an inline rationale (node:crypto has no browser shim). `apps/web/package.json` depends only on `@leadguard/shared`, never `@leadguard/database`. |
| `apps/api` is a "modular monolith" with domain folders | **PARTIAL** | Flat/layered in practice: one `routes.ts` holds all 128 routes; only `billing/` has its own top-level folder. Structure is `controllers/dtos/middleware/services`, not per-domain modules. |
| Real deployment topology exists (containers, k8s, etc.) | **MISSING** | Zero Dockerfiles anywhere, no k8s/Terraform/fly.toml/render.yaml/Procfile. `docker-compose.yml` only provisions local Postgres:15432 / Redis:16380. `docs/DEPLOYMENT.md` describes an Nginx+container topology with no matching artifact in the repo — the README's own audit header already flags this. |
| Feature-flag system / event-bus beyond BullMQ | **MISSING** | Repo-wide search for feature-flag/event-bus/EventEmitter patterns returns no hits in `apps/api`, `apps/worker`, or `packages/shared`. |

### Finance & billing

| Concept | Verdict | Evidence |
|---|---|---|
| Plans | **REAL** | `Plan` model, `schema.prisma:709` — code/price/currency/interval. |
| Pricing | **PARTIAL** | Single price/currency/interval per Plan — no separate `Price` model, no versioning, no multi-currency variants. |
| Subscriptions | **REAL** | `Subscription` model, line 723 — status enum, provider IDs, period dates. |
| Entitlements | **CONFLATED** | No dedicated model — live as an untyped `Json` blob on `Plan`, interpreted by `entitlementService.ts`. |
| Usage tracking | **REAL** | `UsageRecord`, line 865 — org/period/metric counter. |
| Payments | **REAL** | `Payment`, line 744 — provider IDs, amount, status, purpose enum. |
| Invoices | **PARTIAL** | `Invoice`, line 768 — 1:1-ish with Payment, opaque `taxInfo` Json, no line-items model. |
| Refunds | **MISSING** | No `Refund` model — only status-enum values on Payment, no amount/reason/provider-refund-id history. |
| Credits / wallet | **MISSING** | No credit/ledger model found anywhere in schema. |
| Coupons / Offers / Marketing campaigns | **MISSING** | Zero models or services. `ProspectCampaign` (line 969) exists but is a sales-outreach concept, unrelated to commerce discounting. |
| Billing reconciliation | **PARTIAL** | `billingReconciliationService.ts` is real and admin-triggered, but is a local structural-integrity linter (regex/shape checks, amount>0) capped at 500 subs/100 payments per run — it **never calls the live Razorpay API** (explicit code comment) and has no scheduled job. `docs/BILLING.md`'s claim of "background workers scan for state discrepancies" does not match the code. |

### Security, RBAC & admin control

| Area | Verdict | Evidence |
|---|---|---|
| SSRF protection | **REAL** | Consistently enforced at 8+ call sites via `validateExternalUrl`/`fetchPinned` (IP-pinned, redirect-hop re-validated): `routes.ts:1183,1261`, `webhookService.ts:67`, `guestScanService.ts:67`, `worker/audit/fetcher.ts:57,98`, `webhookWorker.ts:90`, `pdfWorker.ts:135`, `vaultRunner.ts:162`. |
| Org-scoped IDOR defense | **REAL** | Consistent `organizationId` filtering sourced from verified JWT claims across sampled query sites in `routes.ts`. |
| Customer-facing RBAC | **REAL** | `apps/api/src/middleware/rbac.ts` — a real 35-capability matrix across 6 roles. `docs/RBAC.md` only documents 9 capabilities — the doc undersells the code, not the reverse. |
| Internal / employee RBAC | **MISSING** | Exactly one primitive: `User.platformAdmin: Boolean` (`schema.prisma:162`), gated by `requirePlatformAdmin()`. No Finance/Support/Security/Marketing/Analyst role differentiation exists — every internal staffer with any admin access gets the same all-or-nothing bit. |
| Admin audit log | **PARTIAL** | Real, persisted `AdminAuditLog` table (`schema.prisma:1176-1189`) — but coverage is narrow: only blog CRUD, user status, org suspension, express-fix status, and billing reconciliation write to it. API-key management and other org-admin actions are not logged. |
| Security incident tracking | **PARTIAL** | Real `SecurityEvent` table, but used for exactly **one** event type in the whole codebase (`REFRESH_REUSE_DETECTED`). SSRF blocks, failed logins, and rate-limit abuse surface as HTTP codes / console logs only — never persisted. |
| Secret encryption | **REAL** | Genuine AES-256-GCM in `packages/shared/src/server-only/secret-encryption.ts` — versioned, isolated via the `server-only/` subpath, used correctly by webhook create/sign paths. |
| Admin UI has a client-side role gate | **MISSING** | `Shell.tsx:39` renders the "Admin Platform" nav link unconditionally for every authenticated user; `ProtectedRoute` (`App.tsx:50-56`) checks only `authenticated`, no role/claim. Protection is 100% server-side — no defense-in-depth at the UI layer. |

### Worker, queues, observability & deployment

| Area | Verdict | Evidence |
|---|---|---|
| Queue architecture | **PARTIAL** | 8 real BullMQ queues (audit, monitoring, vault, report, webhook, agency-competitor/prospect/pitch) with retries/backoff and an outbox-replay self-heal loop. But `docs/QUEUES.md` and `docs/OBSERVABILITY.md` each name a *different* queue set from the code and from each other — no single source of truth, and no dead-letter queue despite QUEUES.md calling it "must add." |
| Worker health monitoring | **MISSING** | No queue-depth metrics, stalled-job alerting, or dead-letter routing — only per-job `console.error`. |
| Logging | **REAL (basic)** | Structured JSON + `redactSensitive()` genuinely implemented — but stdout-only, no aggregation/shipping (no Loki/Datadog/ELK). |
| Metrics & alerting | **MISSING** | No prom-client/Prometheus/StatsD/PagerDuty/Sentry anywhere in `package.json` or code. `docs/OBSERVABILITY.md`'s "14 active queues monitored" is prose only. |
| Deployment topology | **UNDEFINED** | No Dockerfile/k8s/Terraform/Procfile anywhere. Six docs (DEPLOYMENT, PRODUCTION_OPERATIONS, PRODUCTION_INFRASTRUCTURE, BACKUP_RECOVERY, LAUNCH_RUNBOOK, LAUNCH_CHECKLIST) describe a mature Nginx/ALB + WAL-archived-Postgres + S3 + PagerDuty topology, with a launch checklist marked fully checked, none of which has a matching artifact in the repo. |
| Backup / DR strategy | **DOCS-ONLY** | `BACKUP_RECOVERY.md` assumes a managed cloud DB that doesn't exist in this repo. Only real artifact is `retentionService.ts` — an app-level data TTL purge, not a backup mechanism. |
| CI/CD pipeline | **PARTIAL** | `.github/workflows/ci.yml` is real: typecheck → lint (=tsc) → vitest → build against ephemeral Postgres/Redis containers. There is no deploy step of any kind. |
| Ops console for queue inspection | **MISSING** | No Bull Board / Bull Arena / queue-inspection route anywhere. |

### Frontend & product surfaces

| Claim | Verdict | Evidence |
|---|---|---|
| Admin console exists | **REAL** | `features/admin/` (Dashboard/Users/Orgs/AuditLogs views), routed at `/admin/*`, documented as LG-032/LG-033 `IMPLEMENTED` in `FEATURE_REGISTRY.md`, backed by real metrics via `GET /admin/metrics` — not fabricated. |
| Admin is physically/logically separated from the customer app | **MISSING** | Same bundle, same router, same deploy artifact as the customer SPA — separated only by folder naming and path prefix, not by build or deploy boundary. |
| `apps/web` is independently deployable | **PARTIAL** — architecturally yes, operationally no | Own `package.json`/`vite.config.ts`/static SPA build, HTTP-only API client — could ship to a CDN alone. In practice only ever built via the root workspaces script alongside `api`/`worker`; no dedicated Dockerfile/CI/deploy pipeline exists for it in isolation. |
| Frontend maturity | **Production-polished** | Phase 3B1 homepage reconstruction (2026-08-30, COMPLETE) against a Master UX Spec, with explicit anti-fake-data guardrails; ~30+ features (LG-001–LG-037) marked `IMPLEMENTED, production-ready`, only VaultGuard (LG-038) `IN_PROGRESS`. |

---

## 02. Application boundaries

Evaluating each proposed application against what exists today and what actually justifies a change.

- **`apps/web` — Customer & agency product (existing).** Serves customer/prospect/agency users: audits, reports, monitoring, billing, agency tooling, settings. Today it *also* carries the internal admin console. **Target:** keep as-is for its actual customer scope; stop growing internal-only features inside it.
- **`apps/admin` — Internal control plane (Later).** Does not exist as a separate app. The functionality (governance, audit trail) is real but embedded. Extracting it is justified by the security finding above (no client-side role gate, shared attack surface) once the internal-role model (§12, G-05) exists to gate it meaningfully — extracting the shell first without real internal RBAC just moves the same risk to a new address.
- **`apps/api` — Core backend (Now).** Real, working, RBAC- and org-scoped. Structure is flatter than "modular monolith" framing suggests (one `routes.ts`, layered folders) — worth tidying into domain folders incrementally as new domains (offers, campaigns) are added, not as a big-bang refactor.
- **`apps/worker` — Async jobs (Now).** Real, 8 working queues with retry/backoff and an outbox self-heal pattern. Missing operational visibility (metrics, dead-letter queue, ops console) — not missing functionality.

### Frontend/backend physical separation — answered directly

| Question | Answer |
|---|---|
| Is customer frontend physically separated from backend? | **Yes** — SPA over HTTP, no SSR coupling. |
| Is admin frontend physically separated? | **No** — same bundle as customer frontend. |
| Can web be deployed independently today? | **Architecturally yes, operationally no** — no dedicated pipeline exists. |
| Can admin be deployed independently today? | **No** — it isn't a separate artifact. |
| Can API be deployed independently today? | **Architecturally yes, no deploy artifact exists** — no Dockerfile. |
| Can worker be deployed independently today? | **Architecturally yes, no deploy artifact exists** — same gap. |

The honest answer to "is it physically separated" is: **logically, mostly yes; physically/operationally, no** — because there is currently no deployment pipeline for anything in this repo, not because of tight coupling.

---

## 03. Company control plane — domain by domain

Every internal capability an owner should eventually have, with current state, primary internal user, key risk, and whether it needs an audit trail. This consolidates the dashboard, customer-360, finance, offers/campaigns, marketing, analytics, audit/report lifecycle, scanner ops, support, security ops, RBAC, feature-flag, incident, observability, and backup/DR requirements into one control table.

| Domain | Current | Primary user | Key risk if wrong | Audit trail needed |
|---|---|---|---|---|
| Owner command center (MRR/ARR/churn/revenue) | **Missing** | Owner | Decisions made on stale/no data | No (read-only view) |
| Customer 360 (org → usage → billing → support) | **Partial** — pieces exist (AdminOrgsView), not joined | Support, Success, Owner | Support can't see billing context, escalates blind | Yes — every internal view of a customer's data |
| Finance: plans/subscriptions/payments/invoices | **Real** | Finance, Owner | — | Yes — already partially covered |
| Refunds & credits | **Missing** | Finance | Refunds happen ad hoc in Razorpay dashboard with no local record | Yes — money movement |
| Offers / coupons / promotions | **Missing** | Marketing, Owner | Cannot run a discount without a developer | Yes — revenue-affecting |
| Campaigns & events (seasonal, launch) | **Missing** (commerce sense) | Marketing | No way to schedule/measure a promotion | Yes |
| Analytics / BI (funnel, LTV, ROI) | **Partial** — `FunnelEvent` exists, no rollups | Owner, Marketing | No single metric definition | No |
| Audit/report lifecycle tracing | **Real** at the data level | Owner, Support | — | No (already event-sourced) |
| Scanner/worker ops console | **Missing** | Engineering, Support | Stuck audits invisible until a customer complains | Yes — retry/cancel actions |
| Billing reconciliation (vs. live Razorpay) | **Partial** — local-only linter today | Finance, Engineering | Silent revenue drift | Yes — already logged |
| Support / customer success timeline | **Missing** | Support | No account context without asking engineering | Yes |
| Security operations (incidents, SSRF/rate-limit events) | **Partial** — one event type persisted | Security, Owner | Attack patterns invisible until they become an incident | Yes |
| Internal/employee RBAC | **Missing** — single boolean | Owner, all internal staff | Any staffer with admin access can do anything | Yes |
| Admin audit log (comprehensive) | **Partial** — narrow coverage | Owner, Security | Sensitive actions leave no trace | Is the feature |
| Feature flags | **Missing** | Engineering, Owner | Every rollout needs a deploy; no kill switch | Yes — who flipped what |
| Incident / postmortem tracking | **Missing** | Engineering, Owner | No institutional memory of outages | Yes |
| Observability (metrics/alerting) | **Missing** | Engineering | Production issues found by customers, not the team | No |
| Backup / disaster recovery | **Docs-only** | Engineering, Owner | A bad migration or disk failure could be unrecoverable | Yes — recovery drills |

---

## 04. Data domains & ownership

Grouping the 50 existing Prisma models (plus proposed additions) into owned domains, so no future feature has to guess who's responsible for a table.

| Domain | Owner | Existing models | Proposed additions |
|---|---|---|---|
| Identity & Auth | apps/api | User, Account, Session, PasswordResetToken, EmailVerificationToken, SecurityEvent | — |
| Organizations & RBAC | apps/api | Organization, OrganizationMember | `InternalRole`, `InternalPermission` |
| Websites & Audits | apps/api + apps/worker | Website, WebsiteDomain, WebsiteSettings, Audit, AuditRun, AuditPage, AuditFinding, AuditScore | — |
| VaultGuard | apps/worker | VaultAuditFinding, VaultAuditRun | — |
| Reports | apps/api + apps/worker | Report, ReportVersion, ReportShareLink | — |
| Monitoring | apps/worker | MonitoringConfig, MonitoringRun, MonitoringFinding, MonitoringAlert | — |
| Billing & Commerce | apps/api | Plan, Subscription, Payment, Invoice, ExpressFixFulfillment, ExpressFixLead | `Refund`, `Credit`, `Coupon`, `Offer`, `PromotionCampaign` |
| Analytics | apps/api | FunnelEvent, BillingEvent, UsageRecord | `MetricDefinition` (single source of truth per metric) |
| Developer / Public API | apps/api | ApiKey, ApiUsage | — |
| Webhooks | apps/api + apps/worker | WebhookEndpoint, WebhookDelivery, OutboxEvent | — |
| Agency | apps/api + apps/worker | Testimonial, ClientWorkspace, ClientWorkspaceMember, ProspectCampaign, Prospect, Pitch, PitchGeneration, Widget, CompetitorComparison | — |
| Platform / Operations | apps/api (→ apps/admin later) | AdminAuditLog, NotificationPreference | `FeatureFlag`, `Incident`, `SecurityAlert` |

---

## 05. Backend & frontend target architecture

Every proposed boundary staged as **Now**, **Later**, or not needed — no mechanical file moves.

### apps/api — folder boundaries

| Proposed folder | Timing | Reasoning |
|---|---|---|
| `billing/` | **Now** | Already exists — extend in place with refunds/credits, don't restructure. |
| `offers/`, `campaigns/` | **Now, when built** | New domains should be born as their own folder rather than added to `services/` flat — cheapest time to get the boundary right is at creation. |
| `security/` (incident/event ops) | **Now** | Needed the moment `SecurityEvent` coverage expands past refresh-reuse (G-06). |
| `operations/` (scanner ops console API) | **Later** | Depends on internal RBAC existing first — an ops console without role gating just widens the platformAdmin blast radius. |
| `admin/` as a distinct backend module | **Later** | Today's `adminService.ts` is a reasonable size; split only once it needs its own team ownership. |
| Retrofitting `auth/`, `organizations/`, `audits/` as folders around the existing single `routes.ts` | **Later, opportunistic** | Real but not urgent — do it when a route group is touched for another reason, not as a standalone refactor. |
| Full microservice split (separate deployables per domain) | **Not needed** | No evidence of a scaling bottleneck that a modular monolith can't absorb; see §08. |

### apps/web vs. apps/admin — separation plan

The customer app's existing boundaries (own package.json, own Vite config, HTTP-only API client, no dependency on `@leadguard/database`) are exactly what an admin app would also want. The target is not "combine internal ops into the customer app because both use React" — it's the opposite: extract `features/admin/` into its own workspace once (a) an internal role model exists to gate it server-side and client-side, and (b) it has enough surface (customer 360, ops console, finance controls) to justify its own release cadence. Until then, ship the client-side role gate (G-04) as an immediate, low-risk fix inside the existing app — that alone removes the worst of the current risk without a repo restructure.

---

## 06. Shared packages — what belongs where

| Package | Owns | Must never |
|---|---|---|
| `packages/database` | Prisma schema, migrations, the single `PrismaClient` | Be imported by `apps/web` |
| `packages/shared` | Scanner engines, SSRF/URL-safety, scoring — consumed by api, worker, **and web** | Leak `node:crypto` or any Node-only API into its main barrel (already enforced via `server-only/`) |
| `packages/config` | Zod-validated env loading, single source of truth for config | Be bypassed by raw `process.env` reads in application code |
| `packages/contracts` (proposed) | Shared request/response types between api and web, and eventually admin | Contain implementation logic — types and schemas only |

A `packages/contracts` package does not exist today. It becomes worth creating once a second frontend (admin) needs to agree on API shapes with `apps/web` — before that, it would be a package with one consumer, which is premature.

---

## 07. Repository structure — candidate, not a mandate

This is what the repository could look like at full maturity. Items marked **new** below don't exist today — nothing here should be created mechanically; each only appears when its own roadmap phase (§16) actually calls for it.

```
leadguard/
├── apps/
│   ├── web/            existing — customer + agency product
│   ├── admin/          NEW — internal control plane (Phase 4)
│   ├── api/            existing — core backend
│   └── worker/         existing — async jobs
│
├── packages/
│   ├── database/       existing — Prisma schema + migrations
│   ├── contracts/       NEW — shared types (Phase 4, once admin exists)
│   ├── shared/          existing — scanners, SSRF guard, scoring
│   └── config/          existing — Zod env schema
│
├── infra/               NEW — Dockerfiles, deploy manifests (Phase 10)
├── tests/               existing
├── docs/                existing — reconcile against code per §01 (Phase 1)
├── scripts/             existing
├── .github/             existing — extend CI with a deploy stage (Phase 10)
├── .claude/ · .agents/  existing
│
├── CLAUDE.md · README.md · .env.example · package.json
```

---

## 08. Future-scale test

| Scale | First likely pressure point | Real risk today, or premature? |
|---|---|---|
| 100 customers | None structural — current stack absorbs this comfortably | No risk |
| 1,000 customers | Manual billing reconciliation (capped 500 subs/100 payments per admin-triggered run) starts missing drift silently | Real, near-term — G-02 |
| 10,000 customers | Single `routes.ts` and flat service layer become a genuine collaboration bottleneck; no internal RBAC makes "who can do what" unmanageable with more than 1-2 staff | Real, but design-only work needed now, not code — G-05 |
| 100,000 customers | Postgres single-instance, no read replicas, no queue partitioning by tenant; BullMQ/Redis single instance becomes a shared failure domain | Premature to build for now — flag as decision to revisit (D-08), not a current gap |
| 1M audits | AuditFinding/AuditPage table growth without partitioning; report/PDF storage (currently local-disk fallback masquerading as S3) becomes a real cost/correctness problem | Real but time-boxed — the fake-S3 fallback should be fixed before this, not because of scale |
| 10M audits | Retention/cleanup jobs (already coded but never invoked, per README) become mandatory, not optional | Real — this is a currently-dormant fix, not new work |

The honest scale story: nothing here requires Kubernetes, microservices, or a data warehouse before 10K customers. The real near-term pressure points are operational maturity (observability, reconciliation, RBAC), not horizontal scale.

---

## 09. "Owner does not need a developer" test

| Operation | Today |
|---|---|
| View revenue / customer / MRR | **No** — no command-center dashboard, would need a DB query |
| View a customer's org, usage, plan | **Partial-yes** — AdminOrgsView exists |
| Suspend an account | **Yes** — real, audit-logged |
| Review a payment / failed payment | **Yes** — Payment/Invoice views exist |
| Issue a refund | **No** — no Refund model or flow |
| Run billing reconciliation | **Yes** — admin-triggered, but local-only (§01) |
| Create an offer / coupon | **No** — no such system exists |
| Schedule / pause a campaign | **No** |
| Change plan availability / pricing | **No** — requires a code deploy today |
| View a report / audit | **Yes** |
| View a queue failure / retry a job | **No** — no ops console |
| Disable a feature flag | **No** — no feature-flag system |
| Review a security event | **No** — SecurityEvent exists but has no admin view and covers one event type |

---

## 10. "Everything in my hand" control inventory

- **Full control today:** customers, organizations, users, subscriptions, payments, invoices, reports, audits, monitoring, admin audit trail (narrow).
- **Partial control:** analytics (data exists, no rollup views), security events (logged for one type only), support context (data exists across tables, not joined into one timeline).
- **No control today:** plans/pricing changes, offers/coupons/campaigns, refunds/credits, feature flags, incidents, queue operations.
- **Requires safeguards when built:** **refund issuance** (needs approval threshold + AdminAuditLog entry + Razorpay-side verification, since money leaves the business) and **price/plan changes** (needs versioning so existing subscribers aren't silently repriced, + audit log of who changed what and when).

---

## 11. Technology & tooling R&D

| Tool | Purpose | Why LeadGuard needs it | Priority |
|---|---|---|---|
| Bull Board (or Bull Arena) | Queue inspection UI | Closes the "stuck audits invisible" gap cheaply — a drop-in Express route over existing BullMQ queues, no new infra | P1 |
| Sentry (or self-hosted GlitchTip) | Error tracking + alerting | Zero error visibility today beyond stdout; smallest lift for the biggest blind-spot reduction | P1 |
| prom-client + a managed Grafana Cloud/Prometheus target | Metrics | Needed before queue depth/latency become guesswork at scale — genuinely deferrable until Phase 10 | P2 |
| A minimal feature-flag store (own table + admin toggle UI) | Kill switches, staged rollout | Current scale doesn't justify LaunchDarkly-class spend; a flags table + cached read is enough | P2 |
| Dockerfile per app + one deploy target (Fly.io/Render/a single VPS + Nginx) | Actually make the documented deployment topology real | Currently the single largest doc-vs-reality gap in the whole repo | P0 |
| Gitleaks in CI | Secret-scanning | Cheap, no infra, catches the exact class of mistake CLAUDE.md already warns about | P2 |
| Dependabot | Dependency currency | Already native to GitHub, zero cost to enable | P3 |
| A managed Postgres with PITR (e.g. RDS/Neon/Supabase) | Make BACKUP_RECOVERY.md's claims real | Currently zero backup mechanism exists for the actual database | P1 |

Deliberately not recommended: CodeQL/Semgrep as an immediate priority (valuable, but the codebase's actual verified gaps right now are architectural/operational, not static-analysis-shaped); a data-warehouse/BI tool (no volume of data yet to justify it); Context7 as a requirement (useful when live library-API uncertainty comes up, not a standing dependency).

---

## 12. Master gap analysis

P0 = catastrophic if unaddressed · P1 = critical · P2 = high · P3 = medium · P4 = low.

| ID | Domain | Current | Desired | Gap | Business impact | Priority |
|---|---|---|---|---|---|---|
| G-01 | Deployment | No Dockerfiles/manifests anywhere | Deployable, reproducible topology | Cannot actually ship to production today | Company cannot launch without ad hoc infra work | **P0** |
| G-02 | Billing reconciliation | Local-only linter, no live-Razorpay comparison, no schedule | Scheduled two-way reconciliation against provider truth | Silent revenue drift undetectable past ~500 subscriptions | Real money discrepancies invisible | **P0** |
| G-03 | Backup / DR | Docs assume infra that doesn't exist; no backup mechanism | Automated backups + tested restore | A disk failure or bad migration is unrecoverable | Catastrophic, unrecoverable data loss risk | **P0** |
| G-04 | Admin UI access control | No client-side role gate; nav shown to all authenticated users | Role-gated at both client and server | Defense-in-depth missing on the single highest-privilege surface | One server-side RBAC bug away from privilege escalation | **P1** |
| G-05 | Internal RBAC | Single `platformAdmin` boolean | Role-differentiated internal permissions | No least-privilege for internal staff | Any internal hire with admin access can refund, suspend, or export everything | **P1** |
| G-06 | Security incident tracking | `SecurityEvent` used for 1 of ~5+ relevant event types | SSRF blocks, failed logins, rate-limit abuse all persisted + surfaced | Attack patterns invisible until they escalate | Slower incident response, no forensic trail | **P1** |
| G-07 | Observability | No metrics, no alerting, stdout logs only | Error tracking + basic metrics + alerting | Production issues found by customers first | Reputational + support-load risk | **P1** |
| G-08 | Commerce engine | No Coupon/Offer/Campaign/Refund/Credit models | Full commercial engine per §03 | Cannot run a promotion or refund without engineering | Marketing/finance blocked on developer time | **P1** |
| G-09 | Queue/ops visibility | No queue-depth metrics, no dead-letter queue, no ops console | Bull Board + DLQ + alerting on stalled jobs | Stuck audits invisible until customer complaint | Support cost, customer trust | **P1** |
| G-10 | Documentation accuracy | QUEUES.md, OBSERVABILITY.md, BILLING.md, DEPLOYMENT.md each contradict the code or each other | Docs regenerated from source, kept in sync | New engineers/agents onboard against false claims | Wasted engineering time, false confidence | **P2** |
| G-11 | Entitlements modeling | Untyped `Json` blob on Plan | Typed, validated entitlement schema | No compile-time or runtime guarantee of entitlement shape | Silent entitlement bugs (over/under-granting access) | **P2** |
| G-12 | Invoicing | No line-items model, opaque tax Json | Structured invoice line items + tax model | Cannot support multi-line invoices or jurisdiction-aware tax | Blocks any future enterprise/multi-item billing | **P2** |
| G-13 | Monitoring/retention jobs | Coded but never invoked (per README) | Scheduled and running | Recurring monitoring and data cleanup silently not happening | Watchdog customers not actually being monitored | **P1** |
| G-14 | Report storage / PDF | "S3" fallback silently uses local disk; "PDF" is HTML | Real S3 client + real PDF rendering | Data loss risk on redeploy, format mismatch with expectation | Customer-facing correctness bug | **P1** |
| G-15 | Email delivery | `MOCK` provider only logs to console | Real transactional email provider wired | No password reset / notification email actually sends | Broken account-recovery flow in production | **P0** |
| G-16 | Analytics/BI layer | `FunnelEvent`/`BillingEvent` raw only, no rollups | Defined metrics (MRR, LTV, churn) with single source of truth | No consistent business metrics | Every stakeholder computes their own numbers | **P2** |
| G-17 | CI/CD | CI runs tests/build; no deploy stage | CI/CD through to a real environment | Every release is manual | Slower, riskier releases | **P2** |
| G-18 | Feature flags | None | Minimal flags table + admin toggle | Every rollout requires a deploy, no kill switch | Slower, riskier feature rollout | **P2** |
| G-19 | Repo hygiene | Stray empty `packages/database/packages/database/` cruft (per README) | Removed | Confusing to new contributors | Cosmetic | **P4** |

---

## 13. Master decision register

| Decision | Reason | Alternative considered | Why rejected | Reversibility |
|---|---|---|---|---|
| D-01: Stay a modular monolith, not microservices | Single small team, no evidence of a scaling bottleneck a monolith can't absorb to 10K+ customers | Split api/worker/billing into separate services now | Adds deployment/consistency complexity with no current payoff — premature optimization | Reversible — folder boundaries can be extracted later if domain lines stay clean now |
| D-02: Fix billing reconciliation to call live Razorpay before building a bigger finance domain | G-02 is the highest-consequence gap with real money exposure | Build coupons/offers first (visible, "exciting" feature) | Revenue-integrity risk outranks a nice-to-have marketing feature | Reversible — additive fix, no schema break |
| D-03: Extract `apps/admin` only after internal RBAC exists | An extracted-but-still-ungated admin app is the same risk with extra deploy overhead | Extract the admin app immediately for "proper separation" | Cosmetic separation without access control fixes nothing security-relevant | Reversible — order of operations only |
| D-04: Model entitlements as a typed schema, not a bigger JSON blob | G-11 — current Json blob has bitten similar systems via silent shape drift | Keep Json, add runtime Zod validation only | Validation without a real model still leaves no queryable entitlement state for the command center | Requires a migration — moderate difficulty |
| D-05: Build feature flags as an in-house table, not a vendor SaaS | Current scale doesn't justify LaunchDarkly-class spend/complexity | Adopt a third-party flag service | Cost and a new external dependency for a need a `FeatureFlag` table fully satisfies today | Reversible — can migrate to a vendor later |
| D-06: Observability stack = Sentry (or GlitchTip) + prom-client, not a full ELK/Datadog buildout | Matches current team size and budget; closes the worst blind spots first | Full Datadog/ELK stack | Expensive and over-built for current traffic; revisit at Phase 11 scale | Reversible — additive instrumentation |
| D-07: Deployment target = containers behind one deploy pipeline (Fly.io/Render/single VPS), not Kubernetes | Closes G-01 with the smallest operational surface a small team can actually run | Kubernetes from day one | No evidence of the scale or team size that justifies k8s operational overhead | Reversible — containers portable to k8s later if ever justified |
| D-08: Defer Postgres read-replicas / Redis clustering / queue partitioning | No current evidence of load anywhere near this threshold (§08) | Build it preemptively "to avoid a rewrite later" | Explicitly the kind of premature optimization CLAUDE.md warns against | N/A — deferred, not decided against |

---

## 14. Do-not-build list

- **Microservices split of api/worker/billing** — no scaling evidence justifies the operational cost (D-01).
- **Kubernetes** — team size and traffic don't warrant it; a single deploy pipeline closes the real gap (D-07).
- **A custom auth system** — the existing JWT + rotating refresh + Argon2id implementation is sound; don't touch it without a found defect.
- **A second billing engine parallel to Razorpay integration** — extend the existing one (Refund/Credit models), don't build a parallel ledger system.
- **A premature data warehouse / BI platform** — current data volume doesn't justify it; a metrics-definition layer over Postgres is enough for years.
- **A third-party feature-flag vendor** — an in-house table is sufficient at this scale (D-05).
- **A custom event-bus / message-bus beyond BullMQ** — BullMQ already covers async needs; adding Kafka/NATS now solves a problem that doesn't exist yet.
- **Duplicate admin applications** — one control plane, gated by real internal RBAC, not two half-built ones.
- **Redis Cluster / Postgres read-replicas** — explicitly deferred per D-08, not currently justified.
- **Unnecessary additional MCP servers or tool integrations** — the existing GitHub MCP + Playwright + Claude Code skill setup already covers the team's actual workflow.
- **A rewrite of `apps/api/src/routes.ts` into domain folders as a standalone project** — do it opportunistically per D-01/§05, not as a dedicated refactor sprint.
- **Full CodeQL/Semgrep SAST buildout right now** — valuable eventually, but every verified gap in this audit is architectural/operational, not the class of bug static analysis catches.

---

## 15. Final target architecture

```
COMPANY
   │
   ├── CUSTOMER PRODUCT (apps/web) — LeadGuard + VaultGuard + Agency
   └── ADMIN / CONTROL PLANE (Phase 4 — extracted once internal RBAC exists)
             │
             ▼
   BUSINESS DOMAINS — Audits · Reports · Monitoring · Billing · Agency
             │
             ▼
   API (apps/api) — Express 5, RBAC + org-scoped + SSRF-guarded
             │
        ┌────┴─────┐
        ▼          ▼
  DATABASE     REDIS / BULLMQ
  (Postgres,    (8 queues + outbox)
   Prisma,          │
   50+ models)      ▼
                WORKER (apps/worker)
                scanners, monitoring, reports, webhooks, agency
                     │
                     ▼
                Customer websites (SSRF-pinned fetch only)

   API also feeds:
     OPERATIONS — Ops console · Feature flags · Incidents
     ANALYTICS / FINANCE / SECURITY — Metrics layer · Reconciliation · Incident tracking
```

---

## 16. Implementation roadmap

Only justified work, ordered by dependency and risk. No phase here is authorized to start without separate human approval, per the operating instructions for this document.

### Phase 1 — Architecture & Documentation Foundation
- **Goal:** Reconcile every doc in `docs/` against the source-verified reality in §01.
- **Reason:** G-10 — false documentation actively misleads future work (including this one).
- **DB/API/Worker/Web/Admin impact:** None
- **Tests:** N/A — docs only
- **Risk:** Very low
- **Definition of done:** QUEUES.md, OBSERVABILITY.md, BILLING.md, DEPLOYMENT.md match code exactly, or explicitly marked "target state, not current."

### Phase 2 — Security & Financial Integrity
- **Goal:** Close G-02 (live reconciliation), G-04 (admin client-side gate), G-15 (real email).
- **Reason:** Highest business-risk items: money, access control, account recovery.
- **Dependencies:** None — can start immediately after approval.
- **DB impact:** None for G-04/G-15; possibly none for G-02 (read-path only against Razorpay API).
- **API impact:** Reconciliation service gains live-provider calls; new role-check middleware.
- **Web impact:** `ProtectedRoute` gains a role/claim check.
- **Tests:** Reconciliation drift-detection test against a mocked Razorpay divergence; RBAC route test for admin nav/route gating.
- **Risk:** Medium — touches auth and billing paths, requires care per CLAUDE.md's "requires review" list.
- **Definition of done:** Reconciliation flags a real provider-vs-local mismatch in a test; non-admin users cannot reach `/admin` client-side; password-reset email actually delivers in staging.

### Phase 3 — Backend Domain Boundaries
- **Goal:** Introduce domain folders for new work (offers/, security-ops/) without a big-bang `routes.ts` rewrite.
- **Reason:** Cheapest time to get the boundary right is when the domain is born (§05).
- **Dependencies:** Phase 2 complete (security posture stable first).
- **DB impact:** None yet — structural only.
- **API impact:** New folders; existing routes untouched.
- **Tests:** Existing suite must stay green — this phase must be invisible to behavior.
- **Risk:** Low if done incrementally.
- **Definition of done:** No new service lands in the flat `services/` folder without a domain home.

### Phase 4 — Separate Internal Admin Platform
- **Goal:** Build the internal role model (G-05) and, only once it's real, extract `apps/admin`.
- **Reason:** D-03 — extraction without real RBAC is cosmetic, not a security improvement.
- **Dependencies:** Phase 2 (client-side gate) as an interim measure.
- **DB impact:** New `InternalRole`/permission model — a real migration, requires review per CLAUDE.md.
- **API impact:** New permission-check layer distinct from customer RBAC.
- **Web/Admin impact:** New workspace `apps/admin`; `packages/contracts` created at this point (§06).
- **Tests:** Role-matrix tests per internal role, mirroring existing `admin-rbac.test.ts` pattern.
- **Risk:** Medium-high — auth/RBAC change, requires review before proceeding per CLAUDE.md change control.
- **Definition of done:** A Support-role internal user cannot issue a refund; a Finance-role user cannot suspend an org; every action is in `AdminAuditLog`.

### Phase 5 — Business Control Plane
- **Goal:** Owner command center + Customer 360, joining existing data rather than new collection.
- **Dependencies:** Phase 4 (admin app exists to host it).
- **DB impact:** None — read/aggregation views over existing tables.
- **Risk:** Low — read-only.
- **Definition of done:** Owner can see revenue/MRR/churn and a joined customer timeline without a DB query.

### Phase 6 — Finance & Revenue
- **Goal:** Refund, Credit, structured Invoice line-items, typed Entitlement model (G-08, G-11, G-12).
- **Dependencies:** Phase 4 (admin RBAC to gate refund issuance safely).
- **DB impact:** Real migrations — requires review, must preserve existing Payment/Invoice data.
- **Risk:** Medium — payment-adjacent, on the "requires review" list in CLAUDE.md.
- **Definition of done:** A refund is a real, audited, amount-reconciled record — not a Razorpay-dashboard-only action.

### Phase 7 — Offers / Campaigns / Promotions
- **Goal:** Coupon/Offer/PromotionCampaign models with eligibility, redemption limits, stacking rules (§03/§11).
- **Dependencies:** Phase 6 (finance domain stable, since offers touch checkout/payment).
- **DB impact:** New models — additive, low risk to existing billing data.
- **Risk:** Medium — touches checkout path.
- **Definition of done:** Owner can create, schedule, and disable a coupon without a deploy.

### Phase 8 — Analytics / Attribution
- **Goal:** Define MRR/ARR/churn/LTV/campaign-ROI once, in one place, over existing FunnelEvent/BillingEvent/UsageRecord data.
- **Dependencies:** Phase 7 (offers exist to attribute to).
- **Risk:** Low — read-only aggregation layer.
- **Definition of done:** Every metric on the command center traces to one documented calculation.

### Phase 9 — Operations / Incident Control
- **Goal:** Scanner ops console (retry/cancel/inspect), Incident tracking, expanded SecurityEvent coverage (G-06, G-09, G-13).
- **Dependencies:** Phase 4 (internal RBAC to gate dangerous actions like job-cancel).
- **Worker impact:** Dead-letter queue, stalled-job detection.
- **Risk:** Medium — operator actions need permission + audit trail.
- **Definition of done:** A stuck audit is visible and retryable before a customer notices.

### Phase 10 — Observability / CI / Deployment
- **Goal:** Close G-01, G-07, G-17 — real Dockerfiles, one deploy target, Sentry + prom-client, CI deploy stage.
- **Dependencies:** None technically, but highest-value once Phases 1-2 stabilize what's being deployed.
- **Risk:** Medium — infra change, on CLAUDE.md's "requires review" list.
- **Definition of done:** `docs/DEPLOYMENT.md` and `docs/LAUNCH_CHECKLIST.md` describe exactly what's running, because it's actually running.

### Phase 11 — Scale Readiness
- **Goal:** Revisit D-08 (read replicas, Redis clustering, queue partitioning) only if real usage data justifies it.
- **Dependencies:** Phases 1-10 and real production traffic data.
- **Risk:** Low today because it's explicitly not being built yet.
- **Definition of done:** A documented trigger metric (e.g. Postgres CPU sustained >70%, queue lag >X minutes) exists before any of this is built — not a calendar date.

---

## 17. Final CEO/CTO verdict

### A. What is good today
- A genuinely mature customer product: 50 models, 128 routes, consistent SSRF pinning, org-scoped IDOR defense, a 35-capability RBAC matrix, and encrypted webhook secrets — security discipline well above typical seed-stage SaaS.
- `packages/shared`'s browser-safety boundary is enforced correctly and consistently, not just documented.
- The README is itself a self-verified, source-checked audit — a strong existing habit of not trusting stale docs.
- Frontend product surface is production-polished, with real anti-fake-data discipline baked into its own design process.

### B. What is wrong today
- Deployment, backup/DR, and observability exist as prose, not infrastructure — the single biggest gap in the whole company.
- Billing reconciliation never talks to Razorpay — a real revenue-integrity blind spot.
- The admin console — the highest-privilege surface in the system — has no client-side role gate and only one internal privilege bit server-side.
- Several docs actively contradict the code they describe (queues, observability, billing).

### C. What must change
- Live billing reconciliation, admin access-control hardening, and real deployment infrastructure — the three P0/P1 items with genuine business risk (G-01, G-02, G-04, G-15).
- Internal RBAC must exist before the admin surface grows any further.

### D. What must not change
- The modular-monolith shape of `apps/api`/`apps/worker` — no microservices split is justified.
- The existing auth system, SSRF guard, and RBAC engine — all verified sound; extend, don't replace.
- The `server-only/` subpath convention for Node-only code in `packages/shared`.

### E. What the final company architecture should be
A modular monolith (api + worker) serving two frontends — the existing customer SPA and a future, RBAC-gated internal admin SPA — sharing typed contracts, backed by one PostgreSQL instance and one Redis-backed queue layer, deployed through one real container pipeline, observed through error tracking and basic metrics, and governed by a real internal-role model with comprehensive audit logging. Nothing more exotic than that is currently justified.

### F. Top 20 priorities (condensed from §12)
1. Real deployment infra (G-01)
2. Live billing reconciliation (G-02)
3. Backup/DR (G-03)
4. Real transactional email (G-15)
5. Admin client-side role gate (G-04)
6. Internal RBAC model (G-05)
7. Security incident coverage (G-06)
8. Basic observability (G-07)
9. Commerce engine — refunds first (G-08)
10. Queue ops visibility (G-09)
11. Doc-vs-code reconciliation (G-10)
12. Monitoring/retention jobs actually running (G-13)
13. Real report storage + real PDF (G-14)
14. Typed entitlements (G-11)
15. Structured invoicing (G-12)
16. Analytics single-source-of-truth (G-16)
17. CI deploy stage (G-17)
18. Feature flags (G-18)
19. Coupons/campaigns (Phase 7)
20. Repo hygiene cleanup (G-19)

### G. Top things we should not build yet
See §14 in full — headline items: microservices, Kubernetes, a custom auth system, a parallel billing engine, a data warehouse, a third-party flag vendor, a custom event-bus, duplicate admin apps, Postgres read-replicas/Redis clustering, and any SAST buildout ahead of the architectural fixes above.

### H. Estimated architectural complexity
Moderate. The domain model and security posture are already non-trivial and well-built; what's missing is operational maturity (deployment, observability, reconciliation) and one clean domain extraction (admin), not a redesign. Total roadmap is realistically staged across 11 phases, most of which are additive rather than structural.

### I. Biggest future risks
- Shipping to production without backup/DR or a real deployment pipeline (G-01, G-03) — the highest-consequence risk in this entire report.
- Growing the admin surface further before internal RBAC exists — each new admin feature widens a single-bit blast radius.
- Billing reconciliation staying local-only past ~500 subscriptions, where it was explicitly capped.

### J. Recommended next implementation phase
**Phase 1 (doc reconciliation) immediately, then Phase 2 (security & financial integrity)** — both are low-risk, high-signal, and directly address the three P0 findings (G-01 partially, G-02, G-15) plus the one P1 finding with the widest blast radius (G-04). Phase 4 (internal RBAC + admin extraction) should follow once Phase 2 is verified, not before. **No phase should begin without separate human approval**, per this document's own operating instructions.

---

## 18. Repository integrity

Confirmed at the close of this discovery phase:

```
$ git status --short
(clean — no output)

$ git diff --check
(clean — no output)

Application files modified:  NO
Database modified:           NO
Migrations modified:         NO
Dependencies modified:       NO
Documentation modified:      NO
Git history modified:        NO
Commit:                      NO
Push:                        NO
Pull request:                NO
```

This document is a research artifact only. Implementation begins on Phase 1 (§16) after explicit human approval.
