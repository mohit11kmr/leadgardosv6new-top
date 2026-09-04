# TDD: LeadGuard OS V6 — Technical Design

**Product:** LeadGuard OS V6
**Version:** 1.0
**Date:** September 3, 2026
**Author:** Mohit Kumar
**Status:** Draft

> **Grounding note:** This TDD documents the *actual* implemented architecture of
> LeadGuard OS V6, verified from source — not a proposed stack. Sections labeled
> **"built"** describe what exists and runs today; sections labeled **"planned"**
> describe what the roadmap/hardening passes propose next. None of the "planned"
> items are claimed as complete.

---

## 1. System Architecture

### 1.1 Topology (built)

```
┌─────────────────────────────────────────────────────────┐
│              apps/web (React 19 + Vite)                 │
│    SPA · React Router 7 · TanStack Query 5              │
│    Dashboard, Audits, Monitoring, Reports, Agency       │
│    Developer, Admin, Billing, Settings                  │
│    Zero direct DB access; typed API client only         │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP/JSON (credentials:include)
                            │ Bearer accessToken (localStorage)
                            │ + HttpOnly refresh cookie
                            ▼
┌─────────────────────────────────────────────────────────┐
│                apps/api (Express 5)                     │
│   128 routes (61 GET/44 POST/12 DELETE/11 PATCH)        │
│   modular monolith-ish: controllers/dtos/services        │
│   Auth (JWT + refresh, Argon2id) · RBAC · quota engine    │
│   SSRF gate · webhooks · API keys                        │
└──────────────┬──────────────────────────────┬───────────┘
               │ Prisma                       │ BullMQ enqueue
               ▼                              ▼
┌──────────────────────┐        ┌───────────────────────┐
│  PostgreSQL          │        │  Redis                │
│  · 50 Prisma models  │        │  · 14 BullMQ queues   │
│  · transactional     │        │  · rate-limiting      │
│    outbox            │        │  · distributed locks  │
└──────────▲───────────┘        └───────────▲───────────┘
           │                                │ job pickup
           │ Prisma                          ▼
           │                 ┌────────────────────────────┐
           └─────────────────┤  apps/worker (BullMQ)       │
                             │ audit/monitoring/report/     │
                             │ webhook/agency-*/vault       │
                             │ outbox-replay (setInterval)  │
                             └──────────────┬──────────────┘
                                            │ HTTP fetch (SSRF-checked)
                                            ▼
                                 Target customer websites
```

`packages/shared` holds scanner engines, SSRF/URL-safety, and scoring, consumed
by both `apps/api` (guest scan path) and `apps/worker`. It **must stay
browser-safe** (`apps/web` imports from it). `packages/database` is the sole
Prisma client + schema owner. `packages/config` centralizes Zod-validated env
loading.

### 1.2 Technology Stack (built)

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Monorepo** | npm workspaces (`apps/*`, `packages/*`) | no Turborepo/Nx |
| **API** | Node.js ESM + Express 5, TypeScript | `apps/api` |
| **Web** | React 19 + Vite 6 + React Router 7 + TanStack Query 5 | `apps/web` |
| **Worker** | BullMQ 5 (Redis) + `setInterval` outbox replay | `apps/worker`, no cron lib |
| **DB** | PostgreSQL + Prisma 6 | `packages/database`, 50 models |
| **Cache/Queues/Rate-limit** | Redis (`ioredis`) | |
| **Auth** | JWT (15-min) + rotating hashed refresh (reuse detection) + Argon2id | `apps/api/src/auth.ts` |
| **Validation** | Zod (partial coverage) | |
| **Payments** | Razorpay, HMAC webhooks | `apps/api/src/billing/` |
| **Scans** | `packages/shared/src/scanners/*` (16 exported scanner modules) | Lead/Revenue/Security |
| **Tests** | Vitest (unit/integration) + Playwright (E2E) | `tests/` |
| **CI** | GitHub Actions `.github/workflows/ci.yml` | typecheck/lint(=tsc)/test/build vs real Postgres/Redis |

---

## 2. Data Storage Design (built)

### 2.1 Database — 50 Prisma models (`packages/database/prisma/schema.prisma`, 1222 lines)

| Domain | Tables |
|--------|--------|
| Identity/Auth | `User`, `Account`, `Session`, `PasswordResetToken`, `EmailVerificationToken`, `SecurityEvent` |
| Org & RBAC | `Organization`, `OrganizationMember` |
| Websites & Audits | `Website`, `WebsiteDomain`, `WebsiteSettings`, `Audit`, `AuditRun`, `AuditPage`, `AuditFinding`, `AuditScore` |
| VaultGuard | `VaultAuditFinding`, `VaultAuditRun` |
| Reports | `Report`, `ReportVersion`, `ReportShareLink` |
| Monitoring | `MonitoringConfig`, `MonitoringRun`, `MonitoringFinding`, `MonitoringAlert` |
| Billing | `Plan`, `Subscription`, `Payment`, `Invoice`, `ExpressFixFulfillment`, `ExpressFixLead` |
| Analytics | `FunnelEvent`, `BillingEvent`, `UsageRecord` |
| Developer/API | `ApiKey`, `ApiUsage` |
| Webhooks | `WebhookEndpoint`, `WebhookDelivery`, `OutboxEvent` |
| Agency | `Testimonial`, `ClientWorkspace`, `ClientWorkspaceMember`, `ProspectCampaign`, `Prospect`, `Pitch`, `PitchGeneration`, `Widget`, `CompetitorComparison` |
| Platform | `AdminAuditLog`, `NotificationPreference` |

**Key practices:** tokens/keys stored as hashes (`tokenHash`, `keyHash`,
`secretHash`); only one migration (`20260831000000_rebaseline`); `FunnelEvent`
is a generic append-only typed event ledger (extendable for Customer 360).

### 2.2 Caching / Rate limiting

- Redis-backed rate limiting (per-IP/per-user windows).
- No heavy caching layer — scans store immutable result snapshots.

---

## 3. API Design (built — 128 routes in `apps/api/src/routes.ts`)

| Group | Example paths | Auth |
|-------|---------------|------|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/logout-all`; `GET/DELETE /auth/sessions(/:id)` | none → cookie/JWT |
| Organizations | `GET/POST /organizations`, `/organizations/:id/switch` | JWT |
| Websites | full CRUD `/websites`, `/websites/:id` | JWT + RBAC |
| Audits | `/audits*`, findings/pages/runs/cancel, `/score`, `/business-impact`, `/summary`, `/scenarios`, `/funnel`, `/whatsapp-optimizer` | JWT + RBAC |
| VaultGuard | `/websites/:id/security-audit*` (POST/GET, runs, findings, retest, PATCH finding, evidence, report) | JWT + RBAC |
| Monitoring | full CRUD `/monitoring*` | JWT + RBAC |
| Reports | `/reports*`, `GET /reports/share/:token` (public, optional password) | JWT + RBAC / none |
| Agency | `/agency/clients`, `/prospect-campaigns`, `/prospects/pitches`, `/widgets`, `/competitors` | JWT + RBAC |
| Developer | `/api-keys*`, `/webhooks*` | JWT + RBAC |
| Billing | `/billing`, `/billing/entitlements`, `/checkout/*`, `/payments`, `/invoices`, `POST /webhooks/razorpay` | JWT+RBAC / HMAC |
| Admin | `/admin/metrics`, `/users`, `/organizations`, `/audit-logs`, `/express-fix` | platform-admin only |
| Settings | `/settings/*` | JWT + RBAC |
| Testimonials | full CRUD `/testimonials*` | JWT + RBAC |
| Public/Guest | `/public/widgets/:id`, `/public/audits`, `/public/reports`, `/public/free-scan`, `/public/scan/:id(/status)` | API key / unauth (UUID capability) |

---

## 4. Scanning Engine (built — `packages/shared/src/scanners`)

The scanner registry (`scannerRegistry`) drives the audit pipeline. Each scanner
is one pure module implementing a typed contract:

| Scanner module | Concern |
|----------------|---------|
| `whatsapp`, `telephone` | WhatsApp/tel CTA presence |
| `forms` | lead-form structure/issues |
| `tracking`, `tracking-page` | tracking pixel / analytics leakage |
| `seo` | meta/SEO tags |
| `opengraph` | OG tags |
| `mixed-content` | mixed content issues |
| `security-headers` | header security |
| `tls` | SSL/TLS health |
| `cart` | cart/checkout leakage (RevenueShield) |
| `consent` | consent/GDPR |
| `structured-data`, `structured-data-page` | schema.org |
| `hreflang`, `hreflang-page` | hreflang/i18n |

**VaultGuard scanners** (security pillar, in `packages/shared/src/scanners` +
`vault/`): `debug-exposure`, `ssl-health`, `auth-guard`, `exposed-asset`,
`security-headers` extension. Each follows a typed `VaultScanner` interface
(`key`, `phase` 0=page/1=host, `probe(ctx)`), with CWE taxonomy + CVSS3.1 sizing
(see `VAULTGUARD_ROADMAP.md` §6c).

**Pipeline** (`apps/worker/src/audit/`):
`orchestrator.ts` → `crawler.ts` (bounded) → `fetcher.ts` → per-page scanners →
`aggregation.ts` (dedupe, website-level) → detection intelligence
(`detectionIntelligenceP1.ts`: consent, duplicate content, hreflang reciprocity)
→ `finalizer.ts` (persist snapshot) → scoring.

**Scoring:** `calculateScores` (isolated) returns Lead, Advertising, SEO,
Security, overall 0–100. Priority weighting = CVSS/severity × business impact
(`business-impact.ts`, `priority.ts`).

---

## 5. Worker & Queues (built)

- **BullMQ 5** with ~14 queues; Redis-backed.
- **Workers** (in `apps/worker/src/`): `audit/`, `monitoring/` (scheduler,
  healthChecker, regressionEngine, alertEngine, cleanup), `report/` (pdfWorker),
  `webhook/` (webhookWorker, outboxReplay, vaultWebhookEmitter), `agency/`
  (competitorWorker, prospectWorker, pitchWorker), `net/` (ssrfSafeProxy).
- **Transactional outbox** (`OutboxEvent`) guarantees webhook delivery with
  retry; `setInterval` outbox-replay (no cron lib).
- **Monitoring** is booted at worker start and covered by `worker-wiring.test.ts`.

---

## 6. Security Architecture (built)

| Control | Implementation |
|---------|----------------|
| **SSRF** | `validateExternalUrl` / `resolveAndValidateExternalUrl` + `fetchPinned` — hard block loopback/private/cloud-metadata |
| **IDOR** | org-scoped queries from JWT claims only |
| **AuthN** | JWT 15-min + rotating hashed refresh, reuse detection, Argon2id |
| **AuthZ** | RBAC middleware (`rbac.ts`) |
| **Secrets** | AES-256-GCM encryption (server-only subpath, browser-safe barrel) |
| **Payments** | server-side verify, HMAC, idempotency, paise-precision |
| **No fake data** | enforced skill + every UI number traces to real API/DB value |
| **Input validation** | Zod (partial — DTOs) |

---

## 7. Frontend Structure (built — `apps/web/src`)

```
apps/web/src/
├── api/        # typed API clients (auth, audits, websites, security,
│               #   monitoring, reports, billing, agency, intelligence, ...)
├── app/        # App.tsx — router mount
├── components/
│   ├── layout/ # Shell, OrganizationSwitcher
│   └── ui/     # Button, Card, Input, ScoreRing, PillarScore, FindingCard,
│               #   MetricCard, Modal, Tabs, States, OnboardingCard, Icons ...
├── features/   # admin, agency, audits, auth, billing, dashboard, developer,
│               #   landing, legal, monitoring, reports, scan, security,
│               #   settings, testimonials, websites
├── hooks/      # shared hooks
└── lib/        # utils
```

---

## 8. Testing Strategy (built)

- **Vitest** (unit/integration): `tests/` split by domain — admin, agency,
  audit, audit-run.auto-fix, billing, blog, crawler, developer, fetcher,
  integration, intelligence, monitoring, organization, outbox, perf, reports,
  retry, scoring, security, settings, testimonials, webhooks, worker-wiring.
- **Playwright** (E2E): `tests/e2e/`, incl. `vaultguard.spec.ts`.
- **Conventions:** `ALLOW_LOCAL_FIXTURES=true`, `fileParallelism: false`; full
  run needs `docker compose up -d` (Postgres :15432, Redis :16380). Some tests
  flaky under full-suite load (5000ms timeout) — re-run in isolation.
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint (=tsc), test, build
  against real Postgres/Redis containers.

---

## 9. Billing & Monetization (built — `BILLING.md`)

- **Provider-agnostic billing** with Razorpay adapter (`billing/razorpayProvider.ts`).
- **State machines** enforced: Payment (CREATED→AUTHORIZED→CAPTURED→REFUNDED;
  illegal backwards transitions rejected), Subscription
  (CREATED→ACTIVE→PAST_DUE/CANCELLED/PAUSED; reactivation).
- **Integrity:** integer paise (no float), server-side verification, idempotent
  webhooks (unique constraints), background reconciliation.
- **Entitlements:** `EntitlementService` centralizes `canRunAudit`,
  `canAddWebsite`, `canUseMonitoring`, `canUseApiKeys`; quota exhaustion → 403
  `PLAN_LIMIT_REACHED`. Usage tracked in `UsageRecord` (org/period/metric).

---

## 10. Deployment & Infrastructure

### 10.1 Current state (OPEN blocker)
- **No real deployment target defined.** Zero Dockerfiles for the apps, no
  k8s/Terraform/Procfile/fly.toml/render.yaml. `docker-compose.yml` only
  provisions local Postgres:15432 / Redis:16380.
- `docs/DEPLOYMENT.md` describes an Nginx+container topology with **no matching
  artifact** in the repo.
- Local dev: `npm run dev` runs api+web+worker concurrently (api :4000, web :5173).

### 10.2 Planned (hardening)
- Define a deployment target (Render/Railway/Fly.io or self-host).
- Add Dockerfiles per app + Caddy/Nginx reverse proxy.
- Separate staging/production, env-driven via `packages/config`.

---

## 11. Roadmap & Backlog

### 11.1 Built & verified
- [x] Full scan engine (16 lead/revenue scanners + VaultGuard security)
- [x] Scoring, business-impact, evidence pipeline
- [x] 128-route API with RBAC, org-scoping, SSRF gate
- [x] 50-model Prisma schema, single migration
- [x] BullMQ worker (audit/monitoring/report/webhook/agency), transactional outbox
- [x] Razorpay billing + entitlements + usage tracking
- [x] Agency white-label + prospecting + competitor radar + AI pitches
- [x] Real PDF (Chromium) + S3-safe report storage
- [x] Watchdog monitoring scheduler booted + regression engine
- [x] Vitest + Playwright + CI green

### 11.2 Hardening backlog (planned)
- [ ] **Password-reset email actually dispatched** (P0 — currently nothing sends it)
- [ ] Real deployment target + Dockerfiles
- [ ] `GET /admin/organizations/:id` Customer 360 join endpoint
- [ ] `Refund` model + credits/wallet ledger
- [ ] Admin observability: view `SecurityEvent`, `/admin/security*` routes
- [ ] Billing reconciliation that actually calls Razorpay in LIVE mode
- [ ] Full Zod validation coverage (DTOs → all routes)

### 11.3 Phase 2+ (from `VAULTGUARD_ROADMAP.md`)
- [ ] VaultGuard AI remediation (LG-039) + retest/verified loop (LG-040)
- [ ] Coupons/offers engine
- [ ] Nuclei sidecar (Docker, host-only, throttled) deep scans
- [ ] CVE/version fingerprinting (offline advisory bundle)
- [ ] Authenticated Playwright scans (opt-in, test account only)
- [ ] Public API documentation

---

## 12. Known Technical Debt & Risks

| Item | Status |
|------|--------|
| No deployment target | **OPEN** — blocks hosted launch |
| Password-reset email absent | **OPEN (P0)** |
| Billing reconciliation no live Razorpay call | **OPEN** |
| No refunds/credits | **OPEN** |
| Zod validation partial | PARTIAL |
| 5000ms flaky tests under full load | OPEN (re-run isolated) |
| `packages/database/packages/database/` stray empty dir | safe to delete |

---

*Technical design grounded in the LeadGuard OS V6 source code and docs, verified
as of 2026-09-03.*
