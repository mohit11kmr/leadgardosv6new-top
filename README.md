# LeadGuard OS V6

A multi-tenant SaaS platform that audits websites for lead-leakage issues (broken tracking pixels, missing SEO/meta tags, insecure headers, exposed debug/config files, TLS problems, missing WhatsApp/tel CTAs, etc.), scores them, and turns the findings into shareable reports, ongoing monitoring, and agency-facing outreach tooling. Billing is handled through Razorpay (India-focused, INR/paise).

Verified from source only (`apps/`, `packages/`, `tests/`, root config files) as of this audit — no prior documentation was used as a source of truth.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Monorepo | npm workspaces (`apps/*`, `packages/*`) | no Turborepo/Nx |
| API | Node.js (ESM) + Express 5, TypeScript | `apps/api` |
| Web | React 19 + Vite 6 + React Router 7 + TanStack Query 5 | `apps/web` |
| Worker | BullMQ 5 (Redis-backed queues) + `setInterval` for outbox replay | `apps/worker`, no cron library |
| Database | PostgreSQL + Prisma 6 (`@prisma/client`) | `packages/database`, 50 models |
| Cache/Queues | Redis (`ioredis`) | also used for rate limiting |
| Auth | JWT (access, 15 min) + rotating refresh tokens (hashed, reuse detection) + Argon2id password hashing | `apps/api/src/auth.ts` |
| Validation | Zod (partial coverage — see audit notes) | |
| Payments | Razorpay, HMAC-signed webhooks | `apps/api/src/billing/` |
| Testing | Vitest (unit/integration) + Playwright (E2E) | `tests/` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | typecheck, lint (=tsc), test, build against real Postgres/Redis containers |

**Needs Verification:** production deployment target/hosting is not defined anywhere in the repo (no Dockerfile for the apps themselves, no k8s/Terraform/Procfile found).

## Architecture

```
                        ┌─────────────────────┐
   Browser  ────────────▶   apps/web (Vite)   │
                        │  React 19 SPA        │
                        └──────────┬───────────┘
                                   │ fetch, credentials:include
                                   │ Bearer <accessToken> (localStorage)
                                   │ + HttpOnly refresh cookie
                                   ▼
                        ┌──────────────────────┐
                        │   apps/api (Express)  │
                        │  /api/v1/*  (128 routes)│
                        │  JWT + RBAC + API-key │
                        └──────┬───────────┬────┘
                               │           │
                    Prisma     │           │  BullMQ enqueue
                               ▼           ▼
                   ┌───────────────┐  ┌───────────────────┐
                   │  PostgreSQL   │  │   Redis (queues,   │
                   │ (50 models)   │  │   rate limits)      │
                   └───────▲───────┘  └─────────┬──────────┘
                           │                     │
                           │ Prisma              │ job pickup
                           │                     ▼
                           │         ┌────────────────────────┐
                           └─────────┤   apps/worker (BullMQ)  │
                                     │ audit / monitoring /    │
                                     │ vault / webhook /       │
                                     │ agency-* / report queues│
                                     └──────────┬──────────────┘
                                                │ HTTP fetch (SSRF-checked)
                                                ▼
                                     Target customer websites
```

`packages/shared` holds the scanner engines, SSRF/URL-safety checks, and scoring logic used by both `apps/api` (guest scan path) and `apps/worker`. `packages/config` centralizes Zod-validated env loading. `packages/database` is the sole Prisma client + schema owner.

## API Endpoints (128 total in `apps/api/src/routes.ts`: 61 GET / 44 POST / 12 DELETE / 11 PATCH)

Grouped summary (see routes.ts for the full line-by-line list):

| Group | Example paths | Auth |
|---|---|---|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`, `/logout-all`; `GET/DELETE /auth/sessions(/:id)` | none → cookie/JWT |
| Organizations | `GET/POST /organizations`, `/organizations/:id/switch` | JWT |
| Websites | full CRUD `/websites`, `/websites/:id` | JWT + RBAC |
| Audits | `/audits*`, findings/pages/runs/cancel, `/score`, `/business-impact`, `/summary`, `/scenarios`, `/funnel`, `/whatsapp-optimizer` | JWT + RBAC |
| VaultGuard (security audit) | `/websites/:id/security-audit*` | JWT + RBAC |
| Monitoring | full CRUD `/monitoring*` | JWT + RBAC |
| Reports | `/reports*`, `GET /reports/share/:token` (public, optional password) | JWT + RBAC / none |
| Agency | `/agency/clients`, `/prospect-campaigns`, `/prospects/pitches`, `/widgets`, `/competitors` | JWT + RBAC |
| Developer | `/api-keys*`, `/webhooks*` | JWT + RBAC |
| Billing | `/billing`, `/billing/entitlements`, `/checkout/*`, `/payments`, `/invoices`, `POST /webhooks/razorpay` | JWT+RBAC / HMAC-verified webhook |
| Admin | `/admin/metrics`, `/users`, `/organizations`, `/audit-logs`, `/express-fix` | platform-admin only |
| Settings | `/settings/*` | JWT + RBAC |
| Testimonials | full CRUD `/testimonials*` | JWT + RBAC |
| Public/Guest | `/public/widgets/:id`, `/public/audits`, `/public/reports`, `/public/free-scan`, `/public/scan/:id(/status)` | API key / unauthenticated (UUID-as-capability) |

## Database Schema (50 Prisma models, `packages/database/prisma/schema.prisma`)

| Domain | Tables |
|---|---|
| Identity/Auth | `User`, `Account`, `Session`, `PasswordResetToken`, `EmailVerificationToken`, `SecurityEvent` |
| Org & RBAC | `Organization`, `OrganizationMember` |
| Websites & Audits | `Website`, `WebsiteDomain`, `WebsiteSettings`, `Audit`, `AuditRun`, `AuditPage`, `AuditFinding`, `AuditScore` |
| VaultGuard (security probe) | `VaultAuditFinding`, `VaultAuditRun` |
| Reports | `Report`, `ReportVersion`, `ReportShareLink` |
| Monitoring | `MonitoringConfig`, `MonitoringRun`, `MonitoringFinding`, `MonitoringAlert` |
| Billing | `Plan`, `Subscription`, `Payment`, `Invoice`, `ExpressFixFulfillment`, `ExpressFixLead` |
| Analytics | `FunnelEvent`, `BillingEvent`, `UsageRecord` |
| Developer/API | `ApiKey`, `ApiUsage` |
| Webhooks | `WebhookEndpoint`, `WebhookDelivery`, `OutboxEvent` |
| Agency | `Testimonial`, `ClientWorkspace`, `ClientWorkspaceMember`, `ProspectCampaign`, `Prospect`, `Pitch`, `PitchGeneration`, `Widget`, `CompetitorComparison` |
| Platform | `AdminAuditLog`, `NotificationPreference` |

Only **one** migration exists (`20260831000000_rebaseline`) — prior migration history was squashed. Good practice: tokens/keys are consistently stored as hashes (`tokenHash`, `keyHash`, `secretHash`), not plaintext.

## Local Setup (Needs Verification against a clean machine — derived from scripts + docker-compose only)

```bash
cp .env.example .env          # fill in JWT_SECRET / COOKIE_SECRET / REFRESH_TOKEN_SECRET (32+ chars each)
npm install
docker compose up -d          # Postgres on :15432, Redis on :16380
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev                   # runs api + web + worker concurrently
```

- Web: http://localhost:5173
- API: http://localhost:4000 (health: `/health`, readiness: `/ready`)

Validation: `npm run typecheck`, `npm run lint` (note: `lint` is literally `tsc --noEmit` in every workspace — there is no ESLint/Prettier configured despite the script name), `npm test`, `npm run build`, `npm run e2e` (Playwright).

## Environment Variables (from `.env.example`, cross-checked against `packages/config/src/index.ts`)

Validated at startup (process exits if invalid): `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (min 32 chars), `REFRESH_TOKEN_SECRET` (min 32 chars), `APP_URL`, `API_URL`, `CORS_ORIGINS`, `PORT`, `PAYMENT_PROVIDER_MODE`, `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `TRUST_PROXY`, plus several audit/rate-limit tuning vars.

Present in `.env.example` but **not** validated by the Zod config schema (typos here fail silently, not at boot): `COOKIE_DOMAIN`, `COOKIE_SECRET`, `AI_PROVIDER`, `AI_API_KEY`, `EMAIL_PROVIDER`, `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`, `REPORT_STORAGE`, `S3_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY`.

## Known Gaps (see full audit for details/severity)

- Monitoring scheduler and retention-cleanup jobs exist in code but are never invoked — recurring monitoring and old-data cleanup do not currently run in the worker process.
- `EMAIL_PROVIDER=MOCK`'s only implementation logs to console; no real email is ever sent.
- `REPORT_STORAGE=S3` path has no real S3 client — it silently falls back to local disk while still returning an S3-shaped URL.
- "PDF" report generation writes HTML, not a PDF binary.
- `packages/database/packages/database/` is stray, untracked, empty migration cruft — safe to delete.

## License

See `LICENSE`.
