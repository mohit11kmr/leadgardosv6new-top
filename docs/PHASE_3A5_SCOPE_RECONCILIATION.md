# Phase 3A.5 — Scope Reconciliation Audit

**Document Version**: 1.0.0-phase-3a5
**Date**: 2026-08-30
**Type**: Read-only reconciliation audit — **NO code changed, NO fixes, NO refactor applied**.
**Base Commit**: `f25405f2d705a6616fed57cc2d5d51603a21871a`
**HEAD (audited)**: `76d4283fa2daff64bd901a889c9b64c2cc3ecf31` (`main`)
**Range**: `f25405f..76d4283` → **30 files, +1568 / −144**
**Commits in range**:
- `8ad4e54f9d7171fb5caa3ee5b4431ad2efb4c476` — "feat: implement foundational design system tokens and standardized UI components for Phase 3A" (15 files)
- `76d4283fa2daff64bd901a889c9b64c2cc3ecf31` — "feat: implement sales lead tracking and funnel analytics for guest express fix flow" (15 files, **HEAD**)

> **Infra caveat**: No DB/Redis/Docker available in this environment (Postgres `localhost:15432` and Redis `localhost:16380` unreachable; `/var/run/docker.sock` absent). All DB-backed integration/runtime behavior in this report is **unverified at runtime** unless a static/type/build check is cited. Static checks performed: API `tsc --noEmit` ✅, web `tsc --noEmit` ✅, config `tsc --noEmit` ✅, `prisma validate` ✅, `prisma migrate diff` (regen migration vs committed SQL) **IDENTICAL** ✅.

---

## 1. Executive Summary

This range contains **two unrelated workstreams bundled into the same diff-range baseline**:

1. **Phase 3A design-system foundation** (commit `8ad4e54`): design tokens, UI primitives, Tailwind-leakage cleanup. In-scope for the **historic Phase 3A scope list** (tokens, a11y, responsive, Alert, ScoreRing, FindingCard, MetricCard, PillarScore, Button, Input, Badge, Icons, Tailwind cleanup).
2. **Phase 2 sales/funnel tracking** (commit `76d4283`): Express Fix lead capture, funnel analytics, admin management queue, billing fulfillment linking, DB migration. **Out of scope** for the historic Phase 3A list.

**Verdict summary:**
- Migration SQL is **accurate and additive** (byte-identical to `prisma migrate diff` regeneration) — safe forward, reversible by dropping the two new tables.
- API, config, and web all **typecheck clean**; Prisma schema **validates**.
- **No new tests** were added in commit `76d4283` for the lead/funnel/admin-queue features (only the pre-committed `reconciliation.test.ts` exists, which does not cover them).
- **Security/privacy and contract gaps** documented (see §5): funnel endpoint swallows all errors and stores raw client IP in `FunnelEvent.data`; `PATCH /admin/express-fix/:id/status` uses a VIEW capability for a write; `PublicAuditFindingDTO.evidence` typed `string | null` but populated with a potentially-object `sanitizeEvidence(...)` output.
- **Partial frontend implementations**: backend endpoints exist for the admin Express Fix queue and (pre-existing) status lookup, but **no corresponding frontend views/routes** were added in this range.
- **Design-system gap introduced in commit `8ad4e54`**: `Badge` gained `warning` and `purple` variants that have **no corresponding `.badge-warning` / `.badge-purple` CSS classes** — these badges render unstyled. The affected `badge-warning`/`badge-purple`/`badge-error` usages predate this range (identical counts in base and HEAD), so this is a **live, pre-existing visual regression that Phase 3A did not close**.

---

## 2. File-by-File Classification (30 Files)

### Category Key
- **A** — Phase 3A design system (in-scope)
- **B** — Phase 3A accessibility (in-scope)
- **C** — Phase 3A responsive / Tailwind cleanup (in-scope)
- **D** — Sales / funnel feature (out-of-scope for Phase 3A)
- **E** — Billing / fulfillment (mixed)
- **F** — Database (schema + migration)
- **G** — Backend API / controllers / DTOs
- **H** — Config
- **I** — Tests
- **J** — Docs
- **K** — Pre-existing user change (committed, not authored by these feature commits)

| # | File | Δ | Class | In/Out/Mixed |
|---|------|----|-------|--------------|
| 1 | `apps/web/src/styles.css` | +202 | A/C | IN (tokens, spacing, Tailwind aliases, 480px/overflow) |
| 2 | `apps/web/src/components/ui/Alert.tsx` | +104 (new) | A/B | IN |
| 3 | `apps/web/src/components/ui/PillarScore.tsx` | +131 (new) | A | IN |
| 4 | `apps/web/src/components/ui/FindingCard.tsx` | +179 | A/B | IN |
| 5 | `apps/web/src/components/ui/MetricCard.tsx` | +36 | A | IN |
| 6 | `apps/web/src/components/ui/ScoreRing.tsx` | +17 | A/B | IN |
| 7 | `apps/web/src/components/ui/Input.tsx` | +16 | B | IN |
| 8 | `apps/web/src/components/ui/Button.tsx` | +2 | A | IN (but variant CSS gap — see §5) |
| 9 | `apps/web/src/components/ui/Badge.tsx` | +2 | A | IN (but variant CSS gap — see §5) |
| 10 | `apps/web/src/components/ui/Icons.tsx` | +24 | A | IN |
| 11 | `apps/web/src/features/admin/AdminDashboardView.tsx` | −82/+82 | C | IN |
| 12 | `apps/web/src/features/agency/AgencyDashboardView.tsx` | −52 | C | IN (cref badge-purple dangling — pre-existing) |
| 13 | `docs/PHASE_3A_IMPLEMENTATION.md` | +129 (new) | J | IN (Phase 3A doc) |
| 14 | `apps/api/src/services/leadService.ts` | +72 (new) | D | OUT |
| 15 | `apps/api/src/services/funnelEventService.ts` | +59 (new) | D | OUT |
| 16 | `apps/api/src/controllers/public/guestScanController.ts` | +44 | D/G | OUT |
| 17 | `apps/api/src/controllers/public/guestExpressFixController.ts` | +69 | D/E | OUT |
| 18 | `apps/api/src/routes.ts` | +41 | D/G | OUT |
| 19 | `apps/api/src/services/adminService.ts` | +121 | D/G | OUT |
| 20 | `apps/api/src/services/public/guestScanService.ts` | +25 | D/G | OUT |
| 21 | `apps/api/src/services/public/publicAuditService.ts` | +2 | D/G | OUT |
| 22 | `apps/api/src/dtos/public.ts` | +13 | D/G | OUT |
| 23 | `apps/api/src/services/billingService.ts` | +40 | E | MIXED (billing core, out-of-scope) |
| 24 | `apps/web/src/features/scan/ScanResultView.tsx` | +39 | D | OUT (frontend hooks for funnel fields) |
| 25 | `apps/web/src/features/billing/ExpressFixCheckoutView.tsx` | +5 | D/E | OUT |
| 26 | `packages/database/prisma/schema.prisma` | +49 | F | OUT |
| 27 | `packages/database/prisma/migrations/20260830120000_phase2_sales_ready/migration.sql` | +77 (new) | F | OUT |
| 28 | `packages/config/src/index.ts` | +2 | H | OUT (`FIRST_CUSTOMER_MODE`, unused) |
| 29 | `apps/api/src/services/billingReconciliationService.ts` | +32 | K | Pre-existing (committed inside 8ad4e54) |
| 30 | `tests/billing/reconciliation.test.ts` | +46 | K/I | Pre-existing (committed inside 8ad4e54) |

**Tallies**: IN-scope A/B/C = 13 · OUT-of-scope D/G/H/F = 13 · MIXED E = 2 · Pre-existing K = 2.
**Workstream split**: Phase 3A design system ≈ 15 files (rows 1–13 + rows 29–30) · Phase 2 sales/funnel ≈ 15 files (rows 14–28).

---

## 3. Design-System vs Historical Scope Compliance

### 3.1 In-scope deliverable mapping (per `docs/PHASE_3A_IMPLEMENTATION.md` §2.2)

| Scope item | Status | Notes |
|-----------|--------|-------|
| `:root` tokens | ✅ | Surface tiers, borders, AA-corrected text tokens, semantic severity aliases, 4px spacing scale, radius, shadows, motion, `--font-mono`. |
| Layout / spacing primitives | ✅ | `mt*/mb*/p*/gap*`, `flexRow/flexBetween/flexCol`, `grid2/3/4`, `gridSplit`, `dashboardSplit` preserved. |
| Canonical Tailwind aliases | ✅ | `.grid-cols-*`, `.space-y-*`, `.text-slate-*`, `.text-sm/xs/lg`, `.font-bold/mono`, `.text-*` mapped to tokens. |
| Responsive (1024/768/480/375) | ✅ | 480px breakpoint + `overflow-x: hidden` safety; 4→2→1 column collapse. |
| Accessibility (focus-visible, a11y) | ✅ | `:focus-visible` outline tokens; `role=alert` in Alert; `role=meter` in ScoreRing; `aria-invalid/describedby` in Input. |
| Alert | ✅ | New, token-based. |
| ScoreRing | ✅ | A11y + `hero` size. |
| FindingCard | ✅ | Tokenized, copyable fix, expandable evidence drawer. Copy-to-clipboard state included (`handleCopyFix`). |
| MetricCard | ✅ | Confidence chips, trend, status badge variants. |
| PillarScore | ✅ | New, weights 35/25/20/20 with `normalizeKey`. |
| Button | ⚠️ | `success`/`link` variants added; CSS `.btn-success` exists, but see §5 for `badge` variant gap (Button OK). |
| Input | ✅ | A11y. |
| Badge | ⚠️ | `purple`/`warning` variants added in TS **but `.badge-purple` / `.badge-warning` CSS undefined** → renders unstyled. |
| Tailwind cleanup (Admin/Agency dashboards) | ⚠️ | Rogue utilities cleaned; `badge-purple` in AgencyDashboardView remains dangling (pre-existing). |

### 3.2 Scope-drift findings (out-of-scope bundled in range)
- **Phase 2 sales/funnel workstream** is cleanly separable and fully out of the historic Phase 3A scope. It was landed after the Phase 3A commit, so it does not contaminate the design-system deliverable.
- **Billing reconcile + test** (rows 29–30) were committed inside `8ad4e54` but their own diff (32/46 lines) is independent business logic (TEST-mode structural payment/order checks), not design system. The Phase 3A doc records them under "User Pre-Existing Files (Preserved Untouched)" — i.e., pre-existing user work that got committed, **not authored** by Phase 3A. Classified **K**.

---

## 4. Phase 2 Sales/Funnel Feature Audit (out-of-scope, included for completeness)

### 4.1 Data model (`schema.prisma` + `migration.sql` 20260830120000)
- **`ExpressFixLead`**: `email`, `name?`, `paymentId @unique`, `fulfillmentId @unique`, `source` (`GUEST_CHECKOUT`), `@@unique([email, auditId])`, indexes `[organizationId, createdAt]`, `[auditId]`.
- **`FunnelEvent`**: `leadId?`, `type`, `data Json?`, `sessionId?`, indexes `[organizationId, type, createdAt]`, `[auditId, createdAt]`.
- Back-relations on Organization / Website / Audit / **Payment (`expressFixLead`)** / ExpressFixFulfillment (`lead`).
- Migration = 2 `CreateTable` + 6 `create_index` + 5 `AddForeignKey`; **no ALTER of existing tables** → additive and reversible.

**Migration safety verdict**: `prisma migrate diff` regenerated SQL is **byte-identical** to the committed migration → the tracked migration exactly matches the schema. Rollback = drop `FunnelEvent` then `ExpressFixLead` (FK order). **No evidence of data loss or destructive DDL.**

### 4.2 Lead & funnel services
- `leadService.getOrCreateForAudit` keys on `[email(lowercase), auditId]` (idempotent upsert).
- `linkPayment` / `linkFulfillment` use `updateMany(... paymentId: null / fulfillmentId: null)` guards → prevents accidental overwrite of an already-linked lead.
- `funnelEventService.record()` uses a **try/catch that swallows all errors** (warns and returns). Combined with the controller returning `200 {success:true}` on *any* failure (including validation/404), **funnel telemetry is fire-and-forget and can silently drop** (acceptable for telemetry, but problematic when a bad `scanId` is also 200'd — see §5).

### 4.3 Billing integration (`billingService.ts`)
- `verify` now returns `{ payment, invoice, duplicate, fulfillmentId }`; links lead via `getOrCreateForAudit` + `linkPayment`/`linkFulfillment`; records `PAYMENT_SUCCESS` (step 12); `createExpressFixFulfillment` records `FULFILLMENT_CREATED` when `auditId` present.
- State transitions are guarded (null-checks via `updateMany`) — **billing idempotency preserved structurally** (verified by reading code; runtime DB behavior **unverified** due to no DB).

### 4.4 Admin management (`adminService.ts` + `routes.ts`)
- `GET /admin/express-fix` (cursor pagination incl. website/audit/payment/lead), `GET /admin/express-fix/stats`, `PATCH /admin/express-fix/:id/status`.
- Write path logs `BillingEvent EXPRESS_FIX_FULFILLMENT_UPDATED` + admin action. **Medium**: a *write* uses `ADMIN_DASHBOARD_VIEW` capability; role set equals `BILLING_MANAGE` (`[OWNER, ADMIN]`), so no privilege escalation, but the naming/least-privilege semantics are inconsistent (see §5).

### 4.5 Frontend consumption (partial)
- `ExpressFixCheckoutView` stores `fulfillmentId` and handles `paymentFailed`.
- `ScanResultView` renders `businessImpact`, `totalFindings`, personalized CTA, and a rewritten disclaimer (no fabricated default-traffic model).
- **Missing**: no admin Express Fix queue UI; no `/express-fix/status/:fulfillmentId` route despite the (pre-existing) backend status endpoint. `OpportunityLossEstimate.isEstimate` is defined but **not consumed anywhere** (verified: no reader). `estimatedOpportunityLoss` is hardcoded `null` (consistent with no-fake-data).

---

## 5. Security, Privacy & Contract Findings (AUDIT — no fixes applied)

| # | Sev | Area | Finding |
|---|-----|------|---------|
| F1 | **HIGH** (privacy/analytics) | `guestScanController` funnel route | Stores **raw client IP** into `FunnelEvent.data` (`data: { clientIp: getClientIp(req) }`). Unauthenticated guest writes create privacy surface (IP = personal data in EU/GDPR). |
| F2 | **MEDIUM** (API correctness) | `guestScanController` funnel route | `catch` returns `200 {success:true}` for **every** error — invalid `scanId`, validation failures, and 404s all report success. Downstream cannot distinguish recorded from dropped. |
| F3 | **MEDIUM** (authorization semantics) | `routes.ts` | `PATCH /admin/express-fix/:id/status` (write) gated by `ADMIN_DASHBOARD_VIEW`; capability name implies read-only. Role set equals `BILLING_MANAGE`, so not an escalation — a least-privilege/naming inconsistency. |
| F4 | **MEDIUM** (frontend regression, pre-existing) | `Badge.tsx` / `styles.css` | `Badge` component exposes `warning` and `purple` variants but **no `.badge-warning` / `.badge-purple` classes exist** in CSS. Views already using `badge-warning` (Webhooks, Reports×3, Admin, Testimonials) and `badge-purple` (Agency) render **unstyled**. Predates this range; Phase 3A added the variants without closing the CSS gap. |
| F5 | **MEDIUM** (contract/typing) | `dtos/public.ts` vs `guestScanService` | `PublicAuditFindingDTO.evidence` declared `string \| null`, but `guestScanService` populates it with `sanitizeEvidence(f.evidence)` which can return a **sanitized object/JSON**, not a string. Typechecks pass (loose typing at the assignment); latent runtime contract mismatch for consumers. |
| F6 | **LOW** (DB wiring) | `schema.prisma` | `FunnelEvent.leadId` has FK but **no index / no back-relation** (`Lead.funnelEvents`), while `FunnelEvent.auditId`/`type` are indexed. Minor join/perf + incomplete ORM navigation. |
| F7 | **LOW** (config hygiene) | `packages/config` | `FIRST_CUSTOMER_MODE` flag added but **referenced nowhere** — dead config (possibly reserved for a future pilot). |
| F8 | **INFO** (test coverage) | tests | Commit `76d4283` added **zero tests** for leadService, funnelEventService, adminService queue, or the new routes. Only pre-committed `reconciliation.test.ts` exists and does not cover these. |
| F9 | **INFO** (rollback/runtime) | infra | DB/Redis/Docker unavailable → migration applied-state, idempotency, and RBAC runtime behavior **unverified** in this environment. |

---

## 6. Test & Verification Evidence (what was run, and limits)

| Check | Command | Result |
|-------|---------|--------|
| API typecheck | `npx tsc -p apps/api/tsconfig.json --noEmit` | ✅ exit 0 |
| Web typecheck | `npx tsc -p apps/web/tsconfig.json --noEmit` | ✅ exit 0 |
| Config typecheck | `npx tsc -p packages/config/tsconfig.json --noEmit` | ✅ exit 0 |
| Prisma schema validation | `npx prisma validate` | ✅ "valid 🚀" |
| Migration ↔ schema consistency | `prisma migrate diff` regen vs committed SQL | ✅ **byte-identical** |
| DB-backed tests (reconciliation, checkout, etc.) | run | ❌ **cannot run** (no DB/Redis/Docker) |

**Conclusion on test evidence**: all static gates (typecheck, schema, migration drift) pass. **No runtime/DB test evidence** exists for the new funnel/lead/admin features in this environment.

---

## 7. Out-of-Scope / Pre-Existing Items (noted, untouched)

- `billingReconciliationService.ts` and `tests/billing/reconciliation.test.ts` — committed inside `8ad4e54`, but recorded as pre-existing user work by the Phase 3A doc; not authored by these feature commits.
- Pre-existing `badge-warning`/`badge-purple`/`badge-error` dangling-class usages — present in base; Phase 3A did not resolve them (see F4).
- Pre-existing Razorpay MOCK-mode test failures (`modes.test.ts`, `live-razorpay.test.ts`) — unrelated, not in range.

---

## 8. Risk Register Summary

| Risk | Sev | Likelihood | Impact | Mitigation status |
|------|-----|-----------|--------|-------------------|
| Client IP stored on guest funnel events (privacy) | HIGH | Certain | Legal/privacy | **None** — flagged |
| Funnel endpoint masks all failures as 200 | MED | High | Silent telemetry loss / wrong 200s | **None** — flagged |
| Write endpoint uses VIEW capability | MED | Low | Semantic/least-privilege | **None** — flagged |
| Unstyled `warning`/`purple` badges (visual+a11y) | MED | Certain | Degraded admin/report UI | **None** — pre-existing, flagged |
| Evidence type contract mismatch | MED | Med | Consumer breakage | **None** — flagged |
| Missing indexes/back-relation on `FunnelEvent.leadId` | LOW | Med | Join/perf | **None** — flagged |
| Untested funnel/lead/admin-queue flows | MED | Med | Regression exposure | **None** — no new tests |
| DB migration not runtime-verified | MED | Med | Deploy risk | Blocked by infra, migration drift-checked ✅ |

---

## 9. Partial vs Complete Implementations

**Complete in range:**
- Phase 3A tokens, a11y primitives, responsive/Tailwind alias layer, Alert, ScoreRing, Input, MetricCard, PillarScore, FindingCard, Icons.
- Additive, drift-free DB migration; typecheck-clean API + web; schema valid.
- Guest funnel event capture + billing fulfillment linking.

**Partial / incomplete:**
- **Badge** variant CSS (warning/purple) — TS added, CSS missing (F4).
- **Admin Express Fix queue** — backend only, no frontend view.
- **Express Fix status page** — backend endpoint pre-exists, no `/express-fix/status/:fulfillmentId` frontend route added in range.
- **`OpportunityLossEstimate.isEstimate`** — defined, exported, never consumed.
- **`FIRST_CUSTOMER_MODE`** — defined, never consumed.

---

## 10. Recommendations (for a *future* fix round — **NOT applied here**)

1. **Privacy (F1)**: stop persisting raw client IP; store only a country/region or hashed/truncated token, or drop IP entirely; add retention/consent note.
2. **API correctness (F2)**: return distinct error codes for invalid `scanId` vs. telemetry-write failure; only mask genuine telemetry failures as non-fatal.
3. **Authorization (F3)**: gate the status-transition write with `BILLING_MANAGE` (or a dedicated manage capability) rather than `ADMIN_DASHBOARD_VIEW`.
4. **Design-system (F4)**: add `.badge-warning` and `.badge-purple` (and `.badge-error`) classes backed by `--warning`/`--purple`/`--danger` tokens to close the unstyled-badge visual/a11y regression.
5. **Contract (F5)**: align `PublicAuditFindingDTO.evidence` typing (or serialize `sanitizeEvidence` output to string) and document the shape.
6. **DB (F6)**: add index + back-relation on `FunnelEvent.leadId`.
7. **Tests (F8)**: add unit tests for lead upsert idempotency, funnel event recording, admin queue transition permission/state, and billing linking guards.
8. **Cleanup (F7)**: wire or remove `FIRST_CUSTOMER_MODE`; consume or drop `OpportunityLossEstimate.isEstimate`.

---

## 11. Approval / Sign-off

| Role | Status | Notes |
|------|--------|-------|
| Audit complete (read-only) | ✅ | 30/30 files classified; no code modified |
| Static verification | ✅ | typecheck, prisma validate, migration drift all pass |
| Runtime/DB verification | ⛔ | Blocked — no DB/Redis/Docker |
| Fixes applied | ❌ | Out of scope for this audit by design |

*Prepared as a read-only reconciliation report. No files were changed in producing this document beyond this report file itself.*
