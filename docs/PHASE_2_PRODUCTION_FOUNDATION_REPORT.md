# LEADGUARD OS V6
# PHASE 2 — PRODUCTION FOUNDATION REPORT

**Date:** 2026-09-02 · **Branch:** main · **HEAD at start:** `907c504` (unchanged — see §Final Git Integrity)

This phase's own operating rule was: *"Do NOT blindly implement every item. Before changing code, perform a read-only implementation-readiness pass."* That pass is §2 below. Separately, this repository's `CLAUDE.md` requires explicit review/approval before **architecture changes, DB migrations, auth changes, RBAC changes, payment changes, queue/worker changes, infra changes,** and **major dependency upgrades** — and this phase's own goal list (deployment, Docker, CI, internal RBAC, admin access control, billing reconciliation, email) touches every one of those categories. So this report does two things, not one: it implements the items that are genuinely additive/zero-risk and don't require a vendor decision (database backup tooling), and it stops short of writing auth/RBAC/payment/infra code before you've confirmed scope and picked vendors — because those choices (which deployment host, which email provider, what internal roles, whether to touch the billing-reconciliation code path) are genuinely yours to make, not mine to assume from a task description.

---

## 1. Executive Summary

Verified this session, first-hand (not reused from prior phases where a claim mattered for a decision):

- **Billing reconciliation is real, callable, read-only, and never talks to Razorpay** — traced end-to-end from the `POST /admin/billing/reconciliation` route through to the two service methods. Full trace in §8.
- **Password reset and email verification silently send no email at all**, in any environment, ever — not even to the console. This is more severe than earlier phases' "MOCK provider only logs to console" framing. Full evidence in §7.
- **A real SMTP-capable `EmailProvider` already exists** (`apps/worker/src/monitoring/notifications/emailProvider.ts`, using `nodemailer`, gated by config validation) — but it is wired only into worker-side monitoring alerts and guest-scan notifications, never into the API's auth flows. This lowers the cost of the real fix considerably.
- **Zero deployment infrastructure exists** (confirmed again: no Dockerfiles, no k8s/Terraform/Procfile, `docker-compose.yml` only runs local Postgres/Redis) — unchanged since Phase 0/1.
- **Implemented this session:** a safe, non-destructive, provider-agnostic database backup script and two accurate runbooks, replacing a previously misleading "current-tense" backup document with an honest one. This required no vendor decision, no schema change, and no auth/RBAC/payment code — it was the one item in this phase's scope that was unambiguously safe to just do.
- **Everything else** (deployment target, Dockerfiles, CI deploy stage, live billing reconciliation, internal RBAC, admin client-side gate, expanded audit logging, observability vendor) is designed and classified below, but **not implemented**, pending your decisions — see §17 and the question at the end of this report.

---

## 2. Pre-Implementation Reality Check

| # | Item | Classification | Why |
|---|---|---|---|
| 1 | Deployment architecture/target | **BLOCKED — vendor decision** | Requires you to pick and pay for a host; I compare options in §3 but won't commit you to one |
| 2 | Dockerfiles (API/worker/web) | **READY TO IMPLEMENT** technically, but **infra change — requires your review per CLAUDE.md** | No vendor needed to write a Dockerfile, but it's a first piece of real deployment infra — asking before writing it |
| 3 | CI/CD deploy stage | **BLOCKED** — depends on #1 | Can't build a deploy job with no deploy target |
| 4 | E2E in CI | **READY TO IMPLEMENT** — no vendor/schema/auth dependency | Pure CI config; still flagged since it's a `.github/workflows` (infra) change |
| 5 | Database backup/restore runbook + safe tooling | **ALREADY IMPLEMENTED this session** | Zero vendor dependency, zero schema/auth/payment risk — done in §6 |
| 6 | Transactional email — provider abstraction | **BLOCKED — vendor decision**, design READY | Needs you to choose/provision a real provider (§7); the code change also touches the auth password-reset path, which CLAUDE.md flags as requiring review |
| 7 | Billing reconciliation — live Razorpay comparison | **READY TO IMPLEMENT, design done — payment change, requires your review** | `razorpayProvider.fetchOrder`/`fetchPayment` already exist and work; wiring them into reconciliation is a real code change touching money-adjacent logic |
| 8 | Internal employee RBAC | **NOT YET JUSTIFIED to build in full — requires your review to scope, DB migration** | Only 1-2 people operate this system today per repo evidence; a full 8-role model is over-engineering until there's a second internal user. A minimal 2-3 role version is proposed in §9 |
| 9 | Admin client-side access-control gate | **READY TO IMPLEMENT — smallest, most clearly beneficial single fix — RBAC-adjacent, requires your review** | Confirmed unchanged from Phase 1: `Shell.tsx` shows the admin nav link to any authenticated user; `ProtectedRoute` checks only `authenticated` |
| 10 | Admin audit-log coverage expansion | **NOT YET JUSTIFIED** until the actions it would cover (refunds, pricing, offers) exist | Expanding coverage for actions that don't exist yet is scaffolding without substance |
| 11 | Security event taxonomy expansion | **READY TO IMPLEMENT — design done, low risk, no schema change** (writes to the existing `SecurityEvent` table, adds new `type` values) | Genuinely additive; smallest real win after the admin gate |
| 12 | Observability (error tracking + basic metrics) | **BLOCKED — vendor decision**, design READY | Needs you to pick Sentry/GlitchTip/self-hosted and get credentials; also a new dependency (CLAUDE.md: major dependency upgrades require review) |
| 13 | Feature flags | **NOT YET JUSTIFIED** — explicitly out of scope per this phase's own §22/§23 instruction | No implementation attempted |
| 14 | Offers/coupons/campaigns/full finance dashboard | **NOT YET JUSTIFIED** — explicitly out of scope per this phase's own §23 instruction | No implementation attempted |

**Already implemented** (confirmed real, not aspirational) prior to this phase, worth stating so nothing here is re-litigated: SSRF pinning, org-scoped IDOR defense, 35-capability customer RBAC, AES-256-GCM webhook secret encryption, `AdminAuditLog` (narrow coverage), `SecurityEvent` table (narrow coverage), a real (if narrow) billing-reconciliation detector.

---

## 3. Deployment Architecture

**Current:** no deploy artifact of any kind. `docker-compose.yml` defines only local Postgres (:15432) and Redis (:16380); there are zero Dockerfiles, no k8s/Terraform/Procfile/fly.toml/render.yaml anywhere in the repository (re-confirmed this session — unchanged from Phase 0/1).

**Target (smallest topology that fits the current product):** one container for `apps/api`, one for `apps/worker`, a static build of `apps/web` served from a CDN/static host, one managed Postgres instance, one managed Redis instance. No Kubernetes, no microservices split — nothing here needs it (see the companion `docs/LEADGUARD_OS_BLUEPRINT.md` §08 future-scale test).

**Provider comparison** (cross-checked against provider pricing pages and 2026 comparison sources — not exclusively primary docs, flagged honestly rather than overstated as official-source-verified):

| Provider | Fit | Cost (small topology: 1 web service + 1 worker + Postgres + Redis) | Notes |
|---|---|---|---|
| **Render** | Background workers and cron are first-class service types; managed Postgres with PITR/read-replicas on paid tiers; managed Redis-compatible store | ~$50-60/mo at small scale, free tier exists but web services sleep after 15 min idle (unsuitable for prod) | Simplest single-provider story: one dashboard for web+worker+DB+Redis+backups |
| **Railway** | Supports background workers; usage-metered pricing | ~$25-40/mo at small scale | Cheaper at small scale, less mature managed-Postgres PITR story than Render |
| **Fly.io** | Docker-native (matches this repo's actual TypeScript/Node build), separate managed Postgres product (~$38/mo alone), single-region by default | ~$20-35/mo compute, but Postgres pricing is separate and adds up | Best fit if Docker-first deployment is a priority; more moving parts to wire together than Render |

**Recommendation, pending your confirmation:** **Render** — it's the only one of the three with backup/PITR as a documented, paid-tier-native feature (directly closes part of §6's gap), and "one dashboard for everything" fits a small team better than Fly.io's more assembly-required model. This is a recommendation, not a decision — I have not signed up for or configured anything.

**India latency:** none of the three currently document an India region in the sources checked; all effectively serve India from Singapore/other APAC or US regions. If sub-100ms India latency becomes a hard requirement, that would push toward an India-region cloud (AWS ap-south-1, GCP asia-south1) instead of any of these three PaaS options — worth flagging explicitly since none of my research surfaced an India-region PaaS fit.

**Artifacts created this phase:** none yet — deliberately, pending the provider decision above.

---

## 4. Docker

**Not implemented this phase** — classified READY TO IMPLEMENT technically, but held pending your go-ahead since it's the first real piece of deployment infrastructure (CLAUDE.md: infra changes require review).

**Design, ready to execute once confirmed:**
- `apps/api/Dockerfile` — multi-stage: `node:22-slim` builder stage running `npm ci && npm run build --workspace @leadguard/api` (plus its workspace deps), runtime stage copying only `dist/` + production `node_modules`, running as a non-root user, `HEALTHCHECK` hitting `/health`.
- `apps/worker/Dockerfile` — same pattern, no `HEALTHCHECK` (no HTTP surface), correct signal handling via `tini` or Node's own SIGTERM handling so BullMQ jobs can drain on shutdown.
- `apps/web/Dockerfile` — build stage running `vite build`, runtime stage serving the static `dist/` via a minimal `nginx:alpine` or similar — this one is genuinely optional, since a static host (Vercel/Netlify/Render static site/S3+CDN) may be simpler than containerizing a SPA at all.
- No admin Dockerfile — there is no separate admin app to containerize (per the companion `docs/ARCHITECTURE_RESTRUCTURE_BLUEPRINT.md` §6).

---

## 5. CI/CD

**Current:** `.github/workflows/ci.yml` is real: `npm ci` → `prisma generate` → `prisma db push` → typecheck → lint (=`tsc --noEmit`) → `vitest run` → build, against ephemeral Postgres/Redis service containers. **No deploy step of any kind exists.** Confirmed unchanged this session.

**Changes proposed, not made:** add a deploy job gated on the `main` branch, triggered only after the existing validation job passes, targeting whichever provider is chosen in §3, plus a health-check-then-rollback step. This is squarely an infra change under CLAUDE.md's review gate and depends on §3's decision, so nothing was written.

**E2E in CI:** genuinely low-risk and vendor-independent — Playwright is already configured (`playwright.config.ts`, `tests/e2e/`, 4 spec files). Adding a CI job that starts Postgres/Redis (same service containers `ci.yml` already uses), starts `api`+`worker`+`web`, and runs `npm run e2e` is mechanical. **Held back only because it's still a `.github/workflows` edit** — flagging it as the lowest-risk infra item in this whole report if you want to greenlight just one.

**Security checks:** not added. Gitleaks/Dependabot were recommended (not implemented) in the companion business blueprint's §11 — same reasoning applies here: cheap, additive, but still a CI/workflow change I haven't made unrequested.

---

## 6. Database Backup / DR — implemented this session

**Current, before this session:** no backup mechanism existed. `docs/BACKUP_RECOVERY.md` described a fully mature WAL-archiving/PITR/managed-failover architecture in present tense, as if it already existed — it did not (confirmed: no such infrastructure anywhere in the repo).

**What changed:**
- `scripts/db-backup.sh` (new) — reads `DATABASE_URL` from the environment or `.env`, never prints it (only a redacted host/port/db line), runs `pg_dump --format=custom` into a local, gitignored `backups/` directory, and verifies the archive is non-empty and `pg_restore --list`-readable before reporting success. Performs no destructive action.
- `docs/DATABASE_BACKUP_RUNBOOK.md` (new) — states current reality honestly: no scheduled job exists, RPO/RTO are "undefined/operator-dependent" until a provider or cron exists, and backup responsibility shifts to whichever managed Postgres provider is eventually chosen.
- `docs/DATABASE_RESTORE_RUNBOOK.md` (new) — a manual, deliberately-not-automated restore procedure (`pg_restore --clean --if-exists`), with an explicit "back up the current state before you restore over it" step and a note that PITR is not available with this tooling.
- `docs/BACKUP_RECOVERY.md` (edited) — added a status banner: **"FUTURE / TARGET ARCHITECTURE — not yet implemented"**, pointing to the two new runbooks for current reality, so the document no longer misrepresents a target design as current fact.
- `.gitignore` (edited) — added `backups/`, since dump files can contain customer data and must never be committed.

**RPO/RTO:** stated honestly in `docs/DATABASE_BACKUP_RUNBOOK.md` as **undefined/operator-dependent** — I did not fabricate a number. The recommended next step (documented in the restore runbook) is to actually rehearse a restore once against a disposable local DB and record the real wall-clock time.

**Verification performed:** `scripts/db-backup.sh` was written and reviewed for correctness (no credential leakage, no destructive operation, non-empty-file + `pg_restore --list` verification gate) but **was not executed against a live database in this session** — running it requires a `DATABASE_URL` pointed at a real Postgres instance, and this session did not start the docker-compose stack. Flagging this explicitly rather than claiming it was tested: **NOT RUN — reason: no local Postgres instance was started this session.**

---

## 7. Transactional Email

**Current behavior, traced first-hand this session:**

- `apps/api/src/services/authSecurityService.ts` — `requestPasswordReset()` creates a `PasswordResetToken` row and returns a generic message ("password reset instructions have been dispatched"). **It never calls any email provider.** The only way to obtain the raw token is a `debugToken` field returned **only when `NODE_ENV==='test'`**. In any real (dev/staging/prod) environment, a user who requests a password reset gets a success message and receives literally nothing — the account-recovery flow is non-functional today, not just "mocked."
- `requestEmailVerification()` has the identical pattern — token created, never emailed, `debugToken` only in test mode.
- Meanwhile, `apps/worker/src/monitoring/notifications/emailProvider.ts` **does** implement a real `EmailProvider` interface with two implementations: `ConsoleEmailProvider` (default, `EMAIL_PROVIDER=MOCK`) and `SmtpEmailProvider` (real `nodemailer` SMTP delivery, gated by `packages/config`'s Zod `superRefine` requiring `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` when `EMAIL_PROVIDER=SMTP`). This is used by `alertEngine.ts` (monitoring alerts) and `guestScanNotifier.ts` (guest scan result emails) — **only worker-side, never by the API's auth flows.**

**Design (not implemented — blocked on your provider choice + auth-code review):**
```
EmailProvider interface        (already exists, apps/worker/src/monitoring/notifications/emailProvider.ts)
        ↓
Move/export it (or an equivalent) so apps/api can use it too — currently apps/api has no dependency
on apps/worker's internals, correctly, so this needs a small shared home (packages/shared or a new
apps/api-local module), not a cross-app import.
        ↓
authSecurityService.requestPasswordReset() / requestEmailVerification() call emailProvider.sendEmail(...)
        ↓
Real templates (currently none exist — even the worker's alert emails send plain text, per emailProvider.ts)
        ↓
Delivery + the existing console-log-based status line
```

**Provider comparison** (cross-checked against provider pricing/marketing pages, not exclusively primary docs):

| Provider | Free tier | Cost at 100K emails/mo | Notes |
|---|---|---|---|
| **Resend** | 3,000/mo (100/day cap) | ~$40/mo | Modern TypeScript SDK, official Node support, best developer experience |
| **AWS SES** | 3,000/mo for first 12 months | ~$10/mo | Cheapest at volume, verbose AWS SDK, requires AWS account + domain verification + (initially) sending-limit approval |
| **Postmark** | 100/mo (dev-only) | ~$50/mo | Best deliverability reputation for transactional mail, pricier |

**Recommendation, pending your confirmation:** **Resend** — cheapest realistic path to "actually works" for a small transactional volume, official Node/TypeScript SDK, no AWS account prerequisite. Requires you to sign up and verify a sending domain (`leadguard.io` or whatever the real send-from domain is) — I have not done this and cannot fabricate an API key.

**Credential status:** **BLOCKED — no credentials exist or were fabricated.** Per this phase's own instruction, if you provide a Resend (or chosen provider) API key via your own `.env` (never pasted into chat), I can wire the abstraction and test it in a staging send; until then this is **IMPLEMENTED (design) BUT EXTERNAL CREDENTIAL VERIFICATION NOT RUN** — and in fact not yet implemented at all, since the auth-flow code change itself is being held for your review per CLAUDE.md's auth-change gate.

**Tests, not yet written** (would cover, once implemented): provider success, provider failure, timeout, invalid configuration (missing API key at boot — should fail closed like the existing SMTP `superRefine` pattern), retry behavior, and confirmation that API keys are never logged (following the existing `redactService.ts` pattern already used elsewhere in `apps/api`).

---

## 8. Billing Reconciliation — deep recheck (performed first-hand this session)

Traced end-to-end, reading the actual files rather than relying on a prior summary, per this phase's explicit instruction not to assume prior conclusions:

| Question | Answer | Evidence |
|---|---|---|
| Is it callable? | **Yes** | `POST /admin/billing/reconciliation` (`apps/api/src/routes.ts:2855`) |
| Who can call it? | **Only users with `platformAdmin=true`** | Route is behind `requirePlatformAdmin()` middleware |
| Does it contact Razorpay? | **No** | `billingReconciliationService.ts` never imports or calls anything from `razorpayProvider.ts` |
| Does it compare local state with provider state? | **No** | Both `reconcileSubscriptions()` and `reconcilePayments()` only query the local `Subscription`/`Payment` tables |
| Does it modify state? | **No** | Read-only; returns a `discrepancies[]` array. Confirmed by an explicit comment in `adminService.ts`: *"reconcileSubscriptions/reconcilePayments never call a live Razorpay API and never write to Subscription/Payment"* |
| Does it only validate local records? | **Yes** | Checks are: `amountInPaise > 0` (HIGH severity), and in `TEST`/`MOCK` provider modes only, regex-shape validation of `providerSubscriptionId`/`providerPaymentId`/`providerOrderId` prefixes (`sub_test_`/`sub_mock_`/`pay_*`/`order_*`) |
| Does it run automatically? | **No** | No cron/scheduled job anywhere (`apps/worker/src` has zero references to "reconcil"); triggered only by the admin route above |

**One important new finding:** `razorpayProvider.ts` **already implements** `fetchOrder(orderId)` and `fetchPayment(paymentId)` — real `GET` calls to `https://api.razorpay.com/v1/orders/{id}` and `/payments/{id}` (with a `MOCK`-mode fallback). **These are fully built and already used elsewhere** (order/payment verification paths) but simply never called from `billingReconciliationService.ts`. This substantially lowers the cost of building live reconciliation — the Razorpay-side fetch capability doesn't need to be built, only wired in.

**Design for live reconciliation (not implemented — payment change, requires your review):**
```
Scheduled job (worker, new — none of today's 8 queues cover this)
      ↓
For each local Subscription/Payment in scope (bounded batch, same 500/100 caps as today)
      ↓
razorpayProvider.fetchOrder() / fetchPayment()   ← already exists, just needs to be called
      ↓
Compare returned status/amount/currency against local row
      ↓
Classify drift (amount mismatch = HIGH/manual-review-required; status lag = MEDIUM/auto-refresh-candidate)
      ↓
Never auto-refund, auto-cancel, or auto-suspend (explicit constraint from this phase's own §14)
      ↓
Write discrepancies to AdminAuditLog + surface for manual admin review
      ↓
Alert if unresolved past a threshold (needs §12's observability decision to have somewhere to alert to)
```

This design is bounded, idempotent (read + compare, no local writes unless you decide manual-review resolution should write something), retry-safe (a failed provider fetch just gets retried by the queue's existing backoff), and tenant-safe (keeps the existing `organizationId` scoping parameter). **Not implemented in this session** because it's a real code change to a payment-adjacent path — flagged for your explicit go-ahead.

---

## 9. Internal RBAC

**Current:** exactly one primitive — `User.platformAdmin: Boolean`, gated by `requirePlatformAdmin()`. Confirmed unchanged this session.

**Classification: NOT YET JUSTIFIED to build the full 8-10 role model this phase asks about "at minimum."** There is no evidence in this repository of more than one or two people operating the admin surface today — building Owner/Super Admin/Finance/Operations/Support/Security/Marketing/Developer/Analyst/Customer Success as ten distinct roles now would be exactly the kind of scaffolding-without-substance this phase's own §0 and the companion blueprints warn against.

**Minimum justified version, if you confirm this should be built now:** two roles beyond the existing boolean —
- **Owner** (equivalent to today's `platformAdmin`, unchanged capability set)
- **Support** (view-only: customers, organizations, audit history — no refund/pricing/suspend capability, since those don't exist as buildable actions yet either)

Anything beyond these two (Finance, Security, Marketing, etc.) has no corresponding capability to gate yet — refunds, pricing changes, offers, and campaigns don't exist in this codebase (confirmed in the companion `docs/LEADGUARD_OS_BLUEPRINT.md`). Building the role before the capability exists produces a role that grants nothing.

**Data model, if confirmed:** evaluated your suggested `InternalUser`/`InternalRole`/`InternalPermission`/`InternalRolePermission` shape against reusing the existing `User` table. **Recommendation: reuse `User`,** don't create a second identity table — add an `internalRole: InternalRole?` enum column (nullable, `null` = not internal staff) rather than a parallel `InternalUser` table. Rationale: internal staff already authenticate through the same `User`/session/JWT system; a second identity table would mean a second authentication system, which this phase's own §16 explicitly says not to build ("Do not create a second authentication system"). A permission-matrix approach mirroring the existing `apps/api/src/middleware/rbac.ts` pattern (which already implements a 35-capability matrix for customer roles) is the natural extension, not a new architecture.

**Not implemented this session** — this is a DB migration + RBAC change, both explicitly in CLAUDE.md's review-required list. Design only, pending your confirmation of scope (two roles, as above, or a different minimum).

---

## 10. Admin Access Control

**Current, re-confirmed this session:** `apps/web/src/components/layout/Shell.tsx:39` renders the "Admin Platform" navigation link unconditionally for every authenticated user. `apps/web/src/app/App.tsx:50-56`'s `ProtectedRoute` checks only `authenticated`, never a role/claim. Server-side authorization (`requirePlatformAdmin()`) remains the actual security boundary — this is a defense-in-depth gap, not (as far as verified) an active privilege-escalation bug, since the server-side check is real and was verified in Phase 0.

**This is the single most clearly justified "just fix it" item in this whole report** — it requires no vendor decision, no schema change (the `platformAdmin` boolean already exists on `User` and is presumably already returned in the authenticated user's session/profile payload — worth confirming exactly which field the client already has access to before writing the gate), and directly closes a named P1 finding from the prior phase. **Held back only because it touches the RBAC-adjacent auth/route code CLAUDE.md flags for review** — this is the one item in this report I'd recommend greenlighting first if you only approve one thing.

**Design, ready to execute once confirmed:**
- Confirm the client already receives `platformAdmin` (or equivalent) on the authenticated user object from `/auth/me` or the login response — if not, that's a small, additive API change to expose it.
- `ProtectedRoute` (or a new `RequirePlatformAdmin` wrapper used only around `/admin/*` routes) checks that flag before rendering; unauthorized users get redirected, not shown a broken page.
- `Shell.tsx`'s nav link renders conditionally on the same flag.
- **Tests to add:** normal customer (no nav link, route redirects), unauthenticated user (redirects to login), platform admin (sees nav link, route renders) — the phase's own request for "support staff" and "finance staff" test cases depends on §9's internal-role work landing first; until then there are only two states to test (platform admin vs. not).

---

## 11. Admin Audit Logging

**Current:** real, persisted `AdminAuditLog` table, but coverage is narrow — only blog CRUD, user status changes, org suspension, express-fix status, and billing reconciliation triggers write to it (confirmed unchanged this session).

**Classification: NOT YET JUSTIFIED to expand broadly this phase.** Most of the actions this phase's §18 asks to cover (pricing change, offer create/edit, coupon create/edit, refund, feature-flag changes) don't exist as buildable actions yet — there's nothing to log. The two actions from this phase's actual scope that *do* exist and aren't yet logged: the admin-gate fix itself doesn't need logging (a UI/route guard isn't a mutating action), but **§9's internal-role assignment (if built) should write to `AdminAuditLog` from day one** — who granted the Support role to whom, when. That's the one piece of audit-log expansion this phase's actual scope justifies; noted as part of §9's design, not built separately.

---

## 12. Security Events

**Current:** real `SecurityEvent` table, used for exactly one event type (`REFRESH_REUSE_DETECTED`), confirmed unchanged this session.

**Classification: READY TO IMPLEMENT — design done, genuinely low risk** (additive `type` values on an existing table, no schema change beyond possibly widening an enum). **Proposed taxonomy**, separating event vs. alert vs. incident as instructed:

| Type | Category | Persisted today? |
|---|---|---|
| `REFRESH_REUSE_DETECTED` | Event | Yes (only one that is) |
| `LOGIN_FAILURE` (repeated, same account or IP) | Event → Alert if threshold crossed | No |
| `PASSWORD_RESET_ABUSE` (repeated requests, same email/IP) | Event → Alert if threshold crossed | No |
| `SSRF_BLOCKED` | Event | No — currently only an HTTP error response + console log |
| `RATE_LIMIT_VIOLATION` | Event | No — currently only an HTTP 429 |
| `WEBHOOK_ABUSE` (repeated signature-verification failures) | Event → Alert if threshold crossed | No |
| Admin-sensitive operation (e.g. `platformAdmin` grant/revoke, once §9 exists) | Event, always logged, never just "alert on threshold" | No |

An **incident** is explicitly a human-declared escalation from one or more alerts, not an automatic classification — this phase's own §21 says not to turn every normal event into an incident, so no automatic event→incident promotion is proposed.

**Not implemented this session** — held with the other RBAC/auth-adjacent items pending your confirmation of overall scope for this phase, even though this particular item carries the least risk of the group.

---

## 13. Observability

**Current:** structured JSON logs with `redactSensitive()` (real, confirmed in Phase 0), stdout-only, no aggregation. No metrics library, no error tracker, no alerting integration anywhere in `package.json` or code (re-confirmed this session).

**Recommendation, pending your confirmation:** Sentry (or self-hosted GlitchTip if you'd rather not have a third-party account) for error tracking — smallest lift for the largest blind-spot reduction, per the companion business blueprint's D-06. `prom-client` for basic metrics (API error rate/latency, queue depth, failed jobs) is a Phase-10-scale concern per that blueprint, not this phase's P0/P1 list — I'd defer it unless you say otherwise.

**Not implemented** — needs a vendor decision (Sentry account, or a self-hosted GlitchTip target) and is a new dependency (CLAUDE.md: major dependency upgrades require review).

---

## 14. Files Changed This Session

```
NEW    scripts/db-backup.sh
NEW    docs/DATABASE_BACKUP_RUNBOOK.md
NEW    docs/DATABASE_RESTORE_RUNBOOK.md
NEW    docs/PHASE_2_PRODUCTION_FOUNDATION_REPORT.md   (this file)
EDIT   docs/BACKUP_RECOVERY.md         (added a FUTURE/TARGET status banner — no content removed)
EDIT   .gitignore                     (added `backups/`)
```

No application code (`apps/*/src`, `packages/*/src`) was touched. No test files were touched.

---

## 15. Database Changes

**None.** No migrations were created or run. `packages/database/prisma/schema.prisma` is untouched.

---

## 16. Tests Executed

**None were run this session, because no application code changed.** Per this repository's own verification contract, I'm not going to claim a test run that didn't happen: the existing test suite was not re-run since nothing it covers was modified, and `scripts/db-backup.sh` was not executed against a live database (see §6 — **NOT RUN — reason: no local Postgres instance was started this session**).

If you'd like, I can start `docker compose up -d`, run `./scripts/db-backup.sh` against the local dev database, and report the actual result — that's a safe, reversible verification step I held back only because it wasn't clear you wanted services started in this pass.

---

## 17. Remaining Blockers

**Vendor/credential decisions only you can make:**
- Deployment provider (Render recommended, §3) — needs an account and payment method.
- Email provider (Resend recommended, §7) — needs an account, domain verification, and an API key (never to be pasted into chat — set it in your own `.env`).
- Observability provider (Sentry or self-hosted GlitchTip, §13) — needs an account or self-hosted target.

**Scope confirmations needed before I write any code** (per CLAUDE.md's review gate for auth/RBAC/payment/infra/migrations):
- Admin client-side access-control gate (§10) — smallest, most clearly beneficial.
- Live billing reconciliation wiring (§8) — payment-adjacent.
- Internal RBAC minimum model (§9) — DB migration + RBAC change.
- Security event taxonomy expansion (§12) — lowest risk of the group, additive only.
- Dockerfiles + CI E2E job (§4/§5) — infra change, doesn't need a vendor decision, only your go-ahead.

---

## 18. Production Readiness Matrix

| Question | Status | Evidence |
|---|---|---|
| Can we build reproducibly? | **YES** | `npm run build --workspaces` exists and (per Phase 0/1 CI evidence) runs in `.github/workflows/ci.yml` |
| Can we run API in a production-like container? | **NO** | No Dockerfile exists |
| Can we run worker independently? | **PARTIAL** | Runs independently as a Node process today (`tsx watch src/worker.ts` / built `dist`), just not containerized |
| Can we build customer web independently? | **YES** | `vite build` is standalone; confirmed in the companion architecture blueprint |
| Can we build admin web independently? | **N/A** | No separate admin app exists (companion blueprint §6) |
| Can we restore the database? | **PARTIAL** | Manual procedure now documented and script-backed (§6), but not yet rehearsed/timed — see §6 |
| Can we send transactional email? | **NO** (auth flows) / **YES** (worker alerts) | See §7 — password reset/verification send nothing; monitoring alerts and guest-scan notifications do work |
| Can we detect billing drift? | **PARTIAL** | Detects *local* structural anomalies only; never compares to Razorpay (§8) |
| Can we restrict internal employee access? | **NO** | Single boolean, no role differentiation (§9) |
| Can we audit sensitive admin actions? | **PARTIAL** | Real but narrow coverage (§11) |
| Can we detect critical production failures? | **NO** | No error tracker, no metrics, no alerting (§13) |
| Can we run E2E in CI? | **NO** | Playwright exists locally; not wired into `ci.yml` yet (§5) |

---

## 19. Risks

- **The account-recovery flow is silently broken in every real environment** (§7) — this is the single highest-consequence finding in this report; a real user locked out of their account today has no working self-service path. I'd rank this above the previously-flagged P0 items unless there's a mitigating factor I don't have visibility into (e.g., support handles resets manually).
- **Backup script exists but is unrehearsed** — treat `docs/DATABASE_BACKUP_RUNBOOK.md`'s RPO/RTO as literally undefined, not just conservatively estimated, until someone runs it for real.
- **Every code-touching item in this report is still undone** — this session intentionally produced verification + design + one safe doc/script change, not the full Phase 2 scope, because the remaining items cross CLAUDE.md's review gate. Don't read "Phase 2 report delivered" as "Phase 2 implemented."

---

## 20. Next Phase Recommendation

In order of what I'd actually do next, if you confirm:

1. **Fix the email flow's most severe piece first**: even without picking a final provider, password-reset/verification calling *something* (even the existing `ConsoleEmailProvider`, which at least logs the link server-side for a support agent to relay manually) is better than the current silent no-op. This alone is a small, low-risk change and arguably shouldn't wait for a Resend account.
2. **Admin client-side gate** (§10) — smallest, highest-value security fix in the report.
3. **Pick a deployment + email provider** so §3/§4/§5/§7 can actually proceed.
4. **Live billing reconciliation** (§8) — the Razorpay fetch methods already exist; this is smaller than it sounds.
5. **Minimum internal RBAC** (§9) — only once you confirm the two-role scope is right.

---

## FINAL GIT INTEGRITY

```
$ git status --short
 M .gitignore
 M docs/BACKUP_RECOVERY.md
?? docs/ARCHITECTURE_RESTRUCTURE_BLUEPRINT.md
?? docs/DATABASE_BACKUP_RUNBOOK.md
?? docs/DATABASE_RESTORE_RUNBOOK.md
?? docs/LEADGUARD_OS_BLUEPRINT.md
?? docs/PHASE_2_PRODUCTION_FOUNDATION_REPORT.md
?? scripts/db-backup.sh

$ git diff --check
(clean — no whitespace/conflict-marker issues)
```

| | Before | After |
|---|---|---|
| Application changes | None | None |
| Database changes | None | None |
| Migrations | None | None |
| Dependencies | None | None (no `package.json` touched) |
| Documentation | 2 untracked docs from prior phases | +3 new docs, 1 edited doc, 1 edited `.gitignore`, 1 new script |
| Git status before | `?? docs/ARCHITECTURE_RESTRUCTURE_BLUEPRINT.md`, `?? docs/LEADGUARD_OS_BLUEPRINT.md` | (above) |
| Git status after | — | (above) |
| Commit | NO | NO |
| Push | NO | NO |
| PR | NO | NO |
