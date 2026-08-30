# LEADGUARD OS V6 — PHASE 3A.6 PRE-3B RISK REMEDIATION PLAN

**Document Version**: 1.0.0-phase-3a6
**Date**: 2026-08-30
**Mode**: AUDIT + REMEDIATION DESIGN ONLY — **NO CODE CHANGES** (no source, schema, migration, tests, deps, or UI modified).
**Repository**: `mohit11kmr/leadgardosv6new-top`
**HEAD audited**: `4969f214cef892cea30e136d0e3bf7062dd6497f`
**Review source**: `docs/PHASE_3A5_SCOPE_RECONCILIATION.md` (re-verified against actual source, not trusted blindly)

> **Verification method**: Every finding below was re-derived from current source (`git show HEAD:...` / working tree), not accepted from the audit alone. Where the audit and source disagreed, source wins and is noted. Static gates re-run: API/web/config `tsc --noEmit` ✅, `prisma validate` ✅, migration↔schema regen drift ✅.
> **Infra constraint**: No PostgreSQL/Redis/Docker available (`localhost:15432`, `localhost:16380` unreachable, no `/var/run/docker.sock`). DB/runtime behavior is **unverified** unless a static check is cited.

---

## 1. EXECUTIVE VERDICT

**NOT READY FOR PHASE 3B.**

Phase 3B is the **Homepage & Conversion Funnel UI**. It will, by definition, wire the guest result page to the funnel-tracking endpoint (`POST /scan/:scanId/funnel`) and will render funnel findings. That is exactly the surface where the two highest-impact latent defects live:

- **F1 — Client-IP privacy** (`/scan/:scanId/funnel` writes raw `clientIp` into `FunnelEvent.data`). Currently dormant because the endpoint has **no frontend caller**, but Phase 3B will activate it → raw PII storage with no retention, no deletion, and no privacy-policy disclosure.
- **F5 — Evidence contract mismatch** (`evidence` declared `string | null` but the authoritative DB type is `Json`; an object is shipped to guests). Phase 3B will consume this field on the result page.
- **F2 — Silent 200 on funnel errors** (validation/record failures masked). Phase 3B becomes the first real client of this endpoint.
- **F4 — Badge CSS regression** (`warning`/`purple` variants broken); Phase 3B will likely introduce new badges on the homepage/funnel and compound the existing unstyled-badge issue.

These four are **blocking** because Phase 3B either *activates* or *consumes* them. All remaining findings (admin authorization F3, partial features F6, test gaps F7, DB verification gap §10, admin-side billing coupling §11) are **non-blocking for Phase 3B start** but must be scheduled immediately after.

The good news: **billing safety is structurally intact** — the sales/funnel commit did not touch webhooks or reconciliation at all (§11), and the migration is additive + drift-free (§Regen). Therefore a *thoroughly gated* Phase 3B is achievable.

---

## 2. CURRENT RELEASE-BOUNDARY ASSESSMENT

Three logically distinct workstreams are currently interleaved in the range `f25405f..HEAD` (clean worktree; no uncommitted changes):

| Workstream | Commit(s) | Files | Classification |
|-----------|-----------|-------|----------------|
| **A. Phase 3A UI foundation** | `8ad4e54` (design system) + `4969f21` (doc) | `styles.css`, `Alert/PillarScore/FindingCard/MetricCard/ScoreRing/Input/Button/Badge/Icons`, Admin/Agency dashboards, `docs/PHASE_3A_IMPLEMENTATION.md` | **IN-SCOPE** for Phase 3A |
| **B. Phase 2 sales/funnel** | `76d4283` | `leadService`, `funnelEventService`, `guestScanController`, `guestExpressFixController`, `adminService`, `billingService`, `publicAuditService`, `guestScanService`, `routes.ts`, `dtos/public.ts`, `ScanResultView`, `ExpressFixCheckoutView`, `config`, `schema.prisma`, `migration.sql` | **OUT-OF-SCOPE** for Phase 3A (separate feature) |
| **C. Pre-existing user change** | inside `8ad4e54` | `billingReconciliationService.ts`, `tests/billing/reconciliation.test.ts` | **PRE-EXISTING** (committed, not authored by these feature commits) |

**Boundary decision (document-level recommendation — no history rewrite):**
- These **must remain in one branch** (no rewrite). Because `76d4283` (sales/funnel) and `8ad4e54` (design system) are already merged sequentially and `4969f21` (doc) is on top, the clean path forward is: **future commits only** — Phase 3B changes land after all Pre-3B Gate items resolve, each as a *new, single-purpose commit*.
- Do **not** attempt to split workstreams retroactively. Logical separation is expressed going forward via: (1) distinct commit messages, (2) no mixing of billing/funnel/design changes in one commit, (3) this plan's Phase 3B scope fence (§13).

---

## 3. FINDINGS + PRIORITY (P0/P1/P2/P3)

Priority legend: **P0** = release blocker · **P1** = security/privacy/revenue risk · **P2** = correctness/UX regression · **P3** = quality debt.

| ID | Finding | Priority | Evidence (source) | Blocks 3B? |
|----|---------|----------|-------------------|------------|
| F1 | Raw client IP stored in `FunnelEvent.data` on `POST /scan/:scanId/funnel` (`data: { clientIp: getClientIp(req) }`); no retention/deletion/disclosure | **P1** | `guestScanController.ts:136`; `request-utils.ts:12`; `schema.prisma` FunnelEvent | **YES** (Phase 3B activates the endpoint) |
| F2 | Funnel endpoint returns `200 {success:true}` on zod-validation and `record()`/DB failures (404 for missing scan **is** correctly handled) | **P2** | `guestScanController.ts:140-142` (catch returns `{success:true}`); schema parse at :117 | **YES** (Phase 3B is first real client) |
| F3 | `PATCH /admin/express-fix/:id/status` (write) gated by **read** capability `ADMIN_DASHBOARD_VIEW` | **P2** | `routes.ts:2153`; `PERMISSION_MATRIX` (VIEW = `['OWNER','ADMIN']`) | NO (admin-side; deferrable) |
| F4 | Badge CSS regression: `warning`/`purple` (component variants) + `badge-error/emerald/indigo/slate` (raw strings) have **no CSS class** → unstyled pills | **P2** | `Badge.tsx:4`; `styles.css:431-461` (no `.badge-warning`/`.badge-purple`); 6× `badge-warning`, 1× `badge-purple`, plus 5×`emerald`/5×`error`/2×`indigo`/5×`slate` consumers | **YES** (Phase 3B adds badges on funnel UI) |
| F5 | `evidence` DTO declares `string \| null` but authoritative DB type is `Json`; an **object** is shipped to guests via `sanitizeEvidence()` | **P1** | `dtos/public.ts:31`; `schema.prisma` `AuditFinding.evidence: Json` (:401); `guestScanService.ts:336`; DTO consumer `ScanResultView.tsx:33` uses `evidence?: any` | **YES** (Phase 3B renders evidence) |
| F6 | Partial features: admin Express-Fix queue (backend-only, no UI); public fulfillment status endpoint (backend-only, no web route); `FIRST_CUSTOMER_MODE` (dead); `OpportunityLossEstimate.isEstimate` (dead); funnel endpoint (backend-only, no client) | **P3** | `routes.ts:2132-2153` no admin UI in `App.tsx`; `guestExpressFixController.ts:154` status route w/ no web route; `config` `FIRST_CUSTOMER_MODE` unreferenced; `isEstimate` unreferenced outside DTO | NO (inventory only) |
| F7 | No tests for funnel events, lead capture, or admin Express-Fix queue; existing `checkout.test.ts` does **not** cover the new verify→lead/funnel coupling | **P2** | `tests/` grep: only `checkout.test.ts` matches; `tests/billing/checkout.test.ts` asserts payment/invoice/duplicate only | Partial (minimal funnel-contract test blocks 3B) |

---

## 4. FINDING 1 — PRIVACY: CLIENT IP IN FUNNEL EVENTS

### 4.1 Audit results (verified against source)

- **Exact field**: `FunnelEvent.data` → JSONB object keyed `clientIp`.
- **Exact storage path**: `POST /public/scan/:scanId/funnel` (mounted at `routes.ts:230`) → `guestScanController.ts:136` → `data: { clientIp: getClientIp(req) }` → `funnelEventService.record` → `db.funnelEvent.create({ data })`.
- **Who produces it**: ONLY this route. Server-side funnel events (`FREE_SCAN_STARTED`, `FREE_SCAN_COMPLETED`, `CHECKOUT_STARTED`, `PAYMENT_SUCCESS`, `FULFILLMENT_CREATED`) in `guestScanService`/`billingService`/`guestExpressFixController` do **not** record client IP. `createGuestScan(ip,...)` uses `ip` only for **rate limiting**, not persistence — that IP is not stored in `FunnelEvent`.
- **Why stored**: convenience metadata for conversion analytics (map event→visitor), added without a stated retention/consent plan.
- **Is it needed?** No — funnel analytics aggregate on `type`/`auditId`/`sessionId`/`websiteId`; per-IP identity is not consumed by any dashboard/query.
- **Representation**: `getClientIp` returns `req.ip || socket.remoteAddress || '127.0.0.1'`; with `TRUST_PROXY` configurable (`packages/config/src/index.ts:44` default `false`). In direct deployments this is the operator's real client IP → **PII**.
- **Retention**: **none** (no TTL, no scheduled deletion).
- **Deletion**: **possible** (table is guest-owned; rows cascade-delete on `audit`/`organization`; but there is no targeted data-retention job).
- **Privacy policy**: a `/privacy` route exists (`App.tsx:63`) but its text (per `UI_UX_RECONSTRUCTION_AUDIT.md`) does **not** disclose funnel IP collection.
- **Current impact**: **dormant** — the route has no frontend caller (see §6), so no real IPs are being written unless the route is called externally. Risk materializes the moment Phase 3B wires `RESULT_VIEWED`/`EXPRESS_FIX_CLICKED`.

### 4.2 Root cause
A convenience `clientIp` metadata field was added to a `Json` analytics blob without a data-minimization decision, retention policy, or disclosure. Because the endpoint is currently unused, there was no operational trigger to surface the issue.

### 4.3 Security / privacy impact
Digital PII (IP) stored indefinitely on unauthenticated guest analytics events, joined to audit/website context, with no retention, no deletion mechanism, and no policy disclosure. GDPR/other-regime exposure if the guest org data is ever subpoenaed or breached; unnecessary attack/perimeter surface.

### 4.4 Minimal fix (proposed — NOT implemented)
Remove the `clientIp` field from the funnel `data` payload entirely (`data: {}` or a small context object without identity). Rate limiting already receives the IP via the separate `createGuestScan(ip,...)` path and is unaffected. This is a **3-line change** requiring no migration.

### 4.5 Data-minimization option (preferred, if IP truly needed for geo/abuse)
- **Anonymize**: store only a **hashed, salted, truncated** token (e.g., `HMAC(ip, {daily salt})` truncated to 32 bits) → non-reversing identity usable only for coarse dedupe, not PII.
- **Or truncate**: store the `/24` network prefix only (never the full host bits).
- **Or drop** entirely (recommended for V1 — no consumer exists today).

### 4.6 Test requirements
- Unit: funnel route persists event with `data` that contains **no** `clientIp` key and no IP-like value.
- Integration: `POST /scan/:scanId/funnel` with a valid scan → event row `data` sanitized.
- Contract: assert schema of `data`.

### 4.7 Migration requirement
**None.** The change is runtime-only (no schema/DDL). If a data-retention policy is later added, a **new** additive migration/backfill job may be required — not part of this fix.

> **Minimal fix magnitude**: 1 file (`guestScanController.ts`) + tests. No schema, no migration, no API shape change (the `data` object shape is internal, not part of `PublicAuditDTO`).

---

## 5. FINDING 2 — API ERROR SEMANTICS: `POST /scan/:scanId/funnel`

### 5.1 Audit results (verified — improves on the audit report)
The audit claimed "all errors → 200". **Source disagrees on one point**: missing scan **is** handled correctly:
```
…guestFunnelEventSchema.parse(req.body)      // ZodError → throw (caught → 200)  [BUG]
const scanResult = await getGuestScanResult(); if (!scanResult) return 404  [CORRECT]
await funnelEventService.record({...})        // DB/create error → caught → 200  [BUG (acceptable for telemetry)]
```
- **Swallowed errors**: (a) **zod validation failures** (bad `scanId` uuid, bad `event` enum, missing/invalid body) → 200; (b) **`funnelEventService.record()` / `getOrCreateSystemGuestOrganization()` / DB failures** → 200.
- **Correctly surfaced**: missing scan → **404 NOT_FOUND**.
- **Client behavior today**: **no client** — the endpoint has no frontend caller (§6). So no existing client contract to preserve.
- **Intent**: comment on the service (`funnelEventService.ts:53`) confirms funnel writes are **best-effort** ("must never break the primary flow") and the service already try/catches + warns internally.
- **Should use 204?** Reasonable: analytics fire-and-forget → **204 No Content** after successful record; **400** on malformed input; **404** on missing scan (already); **500** on unexpected DB/service failure.

### 5.2 Root cause
The outer `try/catch` was repurposed as a blanket error-sink to guarantee best-effort telemetry, which also masked *validation* failures that should surface to the client.

### 5.3 Minimal safe contract (proposed — NOT implemented)
| Condition | Current | Proposed |
|-----------|---------|----------|
| Valid body, scan missing | 404 ✅ | 404 (keep) |
| Malformed body (bad uuid / bad event / bad JSON) | 200 ❌ | **400** `INVALID_ARGUMENT` |
| Valid, telemetry `record()` succeeds | 200 `{success:true}` | **204 No Content** (or keep 200 `{success:true}`; either is acceptable) |
| Unexpected server/DB error | 200 ❌ | **500** `INTERNAL` |
| Telemetry write fails transiently | 200 (swallowed) | Keep **best-effort**? → but do NOT mislabel as 204/200 success. Recommend: log + return 500, and let the **client** choose to ignore (analytics is non-critical on the client side). |

**Recommended implementation shape**: express a `ZodError` catcher immediately after `parse` returning 400; keep the existing 404; wrap only the telemetry write in an inline try/catch that returns 500 on failure (and rely on the service's internal swallow only if the app truly wants zero failure propagation — but then return 204 regardless). **Decision to make**: whether telemetry failure is 500 to the client or swallowed-204. Recommend **500** with a client that ignores analytics failures (client-side `.catch(()=>{})`) — this preserves observability without coupling the user flow to analytics.
- **`204` vs `200`**: 204 is semantically correct for a write with no response body; the current `{success:true}` also works. Pick one and document.

### 5.4 Migration requirement
**None.**

### 5.5 Why this contract
Distinguishes "your request was bad" (400), "the scan doesn't exist" (404), "we are broken" (500), from "recorded" (204). A silent 200 makes the funnel pipeline unobservable and teaches clients wrong assumptions (a bug I patched in the F1/F2 audit reasoning).

> **Note**: because there is no client yet, this can be corrected **before** Phase 3B without breaking anything — do it now while it is cheap.

---

## 6. FINDING 3 — ADMIN AUTHORIZATION

### 6.1 Audit results (verified)
- Route: `PATCH /admin/express-fix/:id/status` (`routes.ts:2153`) — **write** — gated by `requirePermission('ADMIN_DASHBOARD_VIEW')`.
- `ADMIN_DASHBOARD_VIEW` in `PERMISSION_MATRIX` = `['OWNER','ADMIN']`. `BILLING_MANAGE` = `['OWNER','ADMIN']` — **identical role set** → **no privilege escalation**; this is a semantic/naming inconsistency, not an exploit.
- **Precedent**: all other admin **mutations** use dedicated manage caps — `PATCH /admin/users/:id/status` → `USER_MANAGE`; `PATCH /admin/organizations/:id/status` → `ORG_MANAGE`. Only `GET`-style reads here use `ADMIN_DASHBOARD_VIEW` (`/admin/metrics`, `/admin/express-fix`, `/admin/express-fix/stats`).
- Architecture **supports** adding a capability: `PERMISSION_MATRIX` is the single source; `requirePermission` consumes any `Capability` key (`rbac.ts:42-108`). No migration, no DB impact.
- Admin UI: **none exists** for the queue yet (F6), so no frontend permission dependency today.

### 6.2 Recommendation: **ADD NEW PERMISSION** `ADMIN_EXPRESS_FIX_MANAGE'`

Reasoning:
- Follows the established `*_MANAGE` mutation precedent (`USER_MANAGE`, `ORG_MANAGE`, `BILLING_MANAGE`).
- Keeps read (`ADMIN_DASHBOARD_VIEW`) and write (`ADMIN_EXPRESS_FIX_MANAGE`) capabilities semantically separated — least-privilege and self-documenting.
- Assigned role set: `['OWNER','ADMIN']` (identical to `BILLING_MANAGE`), so **no change in who can act** — only the capability name/meaning.

**Alternative** (acceptable, fewer moving parts): reuse `BILLING_MANAGE` for the status transition. `BILLING_MANAGE` already semantically covers fulfillment state; both routes share `['OWNER','ADMIN']`. This is the lower-diff option and avoids introducing a new capability.

**Recommendation**: ADD NEW if the team prefers strict separation; otherwise REUSE `BILLING_MANAGE`. Both are safe; **do NOT** keep `ADMIN_DASHBOARD_VIEW` for a write.

### 6.3 Files likely affected (fix-only)
`apps/api/src/middleware/rbac.ts` (add capability + matrix row) · `apps/api/src/routes.ts:2153` (swap gate). No schema/migration.

### 6.4 Tests required
- RBAC unit: role matrix for the new capability.
- Integration: `ADMIN` can transition; `VIEWER`/`MEMBER` (if they hold VIEW) cannot.

### 6.5 Phase 3B dependency
**Non-blocking.** The admin queue UI is deferred (F6); Phase 3B (public homepage/funnel) does not exercise this endpoint.

---

## 7. FINDING 4 — BADGE CSS REGRESSION

### 7.1 Audit results (verified)
- `Badge.tsx:4` component variants: `critical | high | medium | low | info | success | warning | purple | neutral`.
- `styles.css` **defines `.badge-*` for**: `critical, high, info, low, medium, neutral, success` (:431-461). **Missing**: `warning`, `purple`.
- Raw-string classNames used across views (bypassing the component) referencing missing classes: `badge-warning` (6×), `badge-purple` (1×), `badge-emerald` (5×), `badge-error` (5×), `badge-indigo` (2×), `badge-slate` (5×).
- **Alias masking**: none. The Tailwind-alias layer (`.text-warning`, `.text-muted`, etc.) does **not** define `.badge-*` → no accidental styling masks the gap.
- **Visual consequence**: an element gets only the base `.badge` chrome (padding/radius/uppercase/font) with **no background, no text color, no border** → renders as a transparent, uncolored pill with default text on the dark surface. Reads as "broken/placeholder" badge.

### 7.2 Broken-variant matrix (complete)

| Variant class | TS (Badge component) | CSS `.badge-*` | Tested consumer | Status |
|---------------|----------------------|----------------|-----------------|--------|
| `critical` | ✅ | ✅ | findings severity | OK |
| `high` | ✅ | ✅ | webhooks/status | OK |
| `medium` | ✅ | ✅ | findings | OK |
| `low` | ✅ | ✅ | findings | OK |
| `info` | ✅ | ✅ | agency | OK |
| `success` | ✅ | ✅ | admin/status | OK |
| `neutral` | ✅ | ✅ | defaults | OK |
| **`warning`** | ✅ (added in 3A) | ❌ | webhooks, reports (list/detail/public), admin (systemHealth), testimonials | **BROKEN** (component latent + 6 live raw usages) |
| **`purple`** | ✅ (added in 3A) | ❌ | agency (competitors), agency dashboard | **BROKEN** (1 live raw usage) |
| `error` (raw only) | n/a (not a component variant) | ❌ | reports/public (severity CRITICAL) | **BROKEN** (5 raw usages) |
| `emerald` (raw only) | n/a | ❌ | agency prosp/clients/widgets/competitors, admin users | **BROKEN** (5 raw usages) |
| `indigo` (raw only) | n/a | ❌ | admin users | **BROKEN** (2 raw usages) |
| `slate` (raw only) | n/a | ❌ | agency/widgets, admin | **BROKEN** (5 raw usages) |

### 7.3 Root cause
Phase 3A added `warning`/`purple` to the `Badge` component type and Token variables (`--warning`, `--purple`) but **did not add the corresponding `.badge-warning`/`.badge-purple` CSS rules**; and a long backlog of views use raw `badge-emerald/error/indigo/slate/warning/purple` strings that were never backed by CSS.

### 7.4 Minimal fix (proposed — NOT implemented)
Add `.badge-warning` and `.badge-purple` to `styles.css` mirroring existing variants, e.g. `background: var(--warning-light); color: #fbbf24; border: 1px solid rgba(245,158,11,.3)` / `background: var(--purple-light); color: var(--purple); border: 1px solid rgba(139,92,246,.3)`. Additionally decide the fate of the **raw** classes: either (a) add `.badge-error/emerald/indigo/slate` aliases, or (b) migrate those call-sites to canonical variants (`critical`, `success`, `info`, etc.). Recommend **b** for `error→critical` and alias/migrate the rest — single, low-risk CSS+markup change.

### 7.5 Why this fix
Restores semantic color on all admin/report/agency screens; closes the latent footgun so Phase 3B-authored badges render correctly instead of compounding the issue.

### 7.6 Files likely affected
`apps/web/src/styles.css` (badge block) + the ~9 view files using raw badge strings (only if migrating markup).

### 7.7 Tests required
- Browser/E2E screenshot assertion per variant (background color non-transparent).
- Visual regression: confirm no unstyled `.badge-warning`/`.badge-purple`.

### 7.8 Phase 3B dependency
**Blocking** — Phase 3B homepage/funnel will introduce new badges (e.g., "Express Fix" CTAs, conversion badges) and would either re-trigger unstyled rendering or require the fix mid-flight. Resolve before 3B.

---

## 8. FINDING 5 — EVIDENCE CONTRACT MISMATCH

### 8.1 Audit results (verified — authoritative shape identified)
- **Authoritative data shape**: `AuditFinding.evidence` in Prisma is **`Json`** (`schema.prisma:401`, required, non-null) → stored as JSONB. It is a **structured object** (headers/results/etc. minus PII).
- **`sanitizeEvidence()`** (`guestScanService.ts:282`) explicitly handles **objects** (`typeof evidence === 'object'` → returns sanitized object) → runtime value is an **object**.
- **DTO declares**: `PublicAuditFindingDTO.evidence?: string | null` (`dtos/public.ts:31`) → **WRONG** (declares string, ships object).
- **Frontend type**: `ScanResultView.tsx:33` uses `evidence?: any` → lenient, accidentally absorbs the mismatch (why no compile error).
- **Second service divergence**: `publicAuditService` (authenticated `/audits/:id`) maps findings **without** `businessImpact`/`affectedUrl`/`evidence` at all, while `guestScanService` (public) includes them → the two audit DTO producers now disagree on shape.
- **`estimatedOpportunityLoss`**: both producers emit `null`; the `OpportunityLossEstimate` interface and `ScanResultView`'s minimal reader both exist but are never populated (F6).

### 8.2 Root cause
The DTO was typed optimistically as `string` while the underlying model and the serializer both treat `evidence` as JSON. The mismatch is masked by `any` typings (service returns `any`, frontend reads `any`), so neither TypeScript nor runtime caught it.

### 8.3 Canonical API type (recommended — NOT implemented)
Type `evidence` as its real shape:
```ts
/* shared DTO */
type FindingEvidence = Record<string, unknown> | string | null | undefined;
evidence?: FindingEvidence;
```
- Prefer a **documented structural type** for well-known evidence shapes if a single schema exists; otherwise use `unknown`/`JsonValue` (`import type { Prisma } from '@prisma/client'; evidence?: Prisma.JsonValue | null`).
- **Do NOT coerce to string** just to satisfy TS — that would corrupt data and break the `sanitizeEvidence` object contract.
- Keep `sanitizeEvidence` as the PII boundary; type its output as `JsonValue`.

### 8.4 Frontend type (recommended)
Replace `evidence?: any` with the shared `JsonValue`-based type (or a structural `Evidence` type), so consumers get type safety instead of the current silent `any`.

### 8.5 Serialization format
JSON (already JSONB on the wire). No change to the wire encoding; only the **declared type** and documentation change.

### 8.6 Null behavior
`evidence` is required `Json` in DB but can serialize to `null`/`undefined` when a finding has no evidence → keep the field **optional** (`?`) and represent absence as `null`/omitted consistently across **both** producers (§ divergence below) and the frontend reader.

### 8.7 Backward compatibility
The wire value does **not change** (still JSON); only the TS type widens. `any`-typed consumers (current frontend) keep working. This is a **safe, non-breaking** contract correction. The cross-producer divergence (**publicAuditService omits the fields; guestScanService includes them**) must be resolved to a single canonical shape.

### 8.8 Tests required
- Unit on `sanitizeEvidence`: object, string, nested, PII-field stripping.
- API contract test: `/public/scan/:scanId` finding `evidence` is valid JSON and matches the declared type.
- Type-level test: assign fixture to `PublicAuditFindingDTO.evidence` compiles and rejects a bare `string` only where appropriate.

### 8.9 Phase 3B dependency
**Blocking** — Phase 3B renders funnel findings on the result page and will consume `evidence`. Fixing the type before 3B prevents a broken consumer.

---

## 9. PARTIAL-FEATURE INVENTORY (F6)

| Feature | Backend | Frontend | Classification | Phase 3B impact |
|---------|:-------:|:--------:|----------------|-----------------|
| Guest funnel tracking (`/scan/:scanId/funnel`) | ✅ | ❌ (no caller) | **BACKEND ONLY** | **HIGH** — Phase 3B is the intended client; must resolve F1/F2 first |
| Admin Express-Fix queue (`/admin/express-fix`) | ✅ endpoints | ❌ no admin UI | **BACKEND ONLY** | LOW — admin tooling, deferrable; needs F3 authz when UI is built |
| Public fulfillment status (`/public/express-fix/status/:fulfillmentId`) | ✅ | ❌ no web route | **BACKEND ONLY** | LOW — payment-recovery page; wire in a later phase |
| `FIRST_CUSTOMER_MODE` (`packages/config`) | config only | ❌ | **DEAD / UNUSED** | None — either wire or remove later |
| `OpportunityLossEstimate.isEstimate` | DTO only | ❌ both producers emit `null` | **DEAD / UNUSED** (reserved, no-fake-data guard) | None — keep as reserved, do not emit fabricated figures |
| Funnel event names on server (`FREE_SCAN_STARTED/COMPLETED`, `CHECKOUT_STARTED`, `PAYMENT_SUCCESS/FAILED`, `FULFILLMENT_CREATED`) | ✅ | ❌ not surfaced | **BACKEND ONLY / PARTIAL** | LOW — analytics already recorded server-side |
| `ExpressFixLead` capture (verify path) | ✅ | ✅ (implicit) | **FULLY IMPLEMENTED** (server-coupled) | LOW — no UI change needed |
| Phase 3A design tokens/primitives | ✅ | ✅ | **FULLY IMPLEMENTED** | Foundation for 3B |
| Pre-existing reconcile + test (K) | ✅ | ✅ | **FULLY IMPLEMENTED** (user change) | None |

**Phase 3B relevance**: The **guest funnel endpoint** is the critical partial feature — Phase 3B must either (a) resolve F1/F2 then wire it, or (b) explicitly skip client-driven funnel events and rely on server-side events only. Recommend (a).

---

## 10. TEST-GAP PLAN (F7) — minimum before production-ready

Why: only `tests/billing/checkout.test.ts` touches the new area and it does **not** cover the new `verify`→lead/funnel coupling. The sales/funnel commit shipped with **zero** new tests.

### Unit
- `leadService`: `getOrCreateForAudit` idempotency (same `[email,auditId]` → same lead); email lowercasing; `linkPayment`/`linkFulfillment` null-guard (no overwrite of already-linked).
- `funnelEventService`: `record` success path; swallow-on-error does **not** throw; `data` serialization.

### Integration (service-level, mock DB)
- `billingService.verify` → `ExpressFixLead` created, `payment`/`fulfillment` linked, `PAYMENT_SUCCESS` + `FULFILLMENT_CREATED` funnel events recorded, duplicate handling unchanged.

### API (supertest against app)
- `POST /scan/:scanId/funnel`: 400 on malformed body; 404 on missing scan; 200/204 on success; verify `data` contains **no** `clientIp` (F1); replay/session behavior.
- `GET /public/scan/:scanId`: `evidence` type matches new DTO (F5); `totalFindings` present; `estimatedOpportunityLoss` null.
- `PATCH /admin/express-fix/:id/status`: 401 unauthenticated, 403 without capability (F3), success for ADMIN; invalid transition rejected.

### Database
- Apply migration on a scratch Postgres; assert `ExpressFixLead` + `FunnelEvent` tables/indexes/FKs; `prisma migrate diff` zero-drift (already ✅ statically).

### E2E
- Guest free-scan → result → Express-Fix CTA → checkout → verify → lead/fulfillment link → admin queue shows row (once admin UI exists).

**Gate note**: For Phase 3B start, only a **minimal funnel-contract API test** (F1+F2 semantics) is strictly required; the full suite gates *production-readiness*, not 3B start.

---

## 11. DB/REDIS/ENV VERIFICATION GAP

### 11.1 What remains unverified (not failures — environment-blocked)
- Migration **applied-state** on a real Postgres (static drift-check passed; runtime apply not executed).
- Lead upsert / payment & fulfillment `updateMany` idempotency at the DB transaction level.
- Funnel event persistence and JSONB round-trip.
- Admin queue cursor pagination + stats aggregation correctness on data.
- `getOrCreateSystemGuestOrganization` behavior under concurrency.
- RBAC middleware behavior in a running app (unit logic read; not executed).
- Worker (audit crawl) consumption of the new schema (it is unchanged by this work — only tables were added).
- Redis involvement: none in these features (rate limiter is separate/pre-existing).

### 11.2 Verification checklist (requires a running environment)
1. **PostgreSQL** reachable (`localhost:15432` or equivalent).
2. **Redis** reachable (`localhost:16380`).
3. **Migration**: `prisma migrate deploy` then `prisma migrate diff` zero-drift; tables + indexes present.
4. **Seed**: any seed the repo defines runs.
5. **API**: boot `apps/api`, run the §10 API suite.
6. **Worker**: boot `apps/worker`, confirm audit crawl succeeds against new schema (no regression — schema is additive).

### 11.3 Tests to re-run once environment is available
`tests/billing/*.test.ts` (all), `tests/` integration/e2e that touch audit + billing, plus the new §10 suite. Rationale: verify the additive migration did not perturb concurrent existing flows.

---

## 12. BILLING SAFETY REVIEW

Verified against source — **no billing regression is introduced by F1–F7**:

| Concern | Status (verified) |
|---------|-------------------|
| Webhooks handling | **Untouched** by sales/funnel commit (`76d4283` file list has no webhook files) ✅ |
| Reconciliation | **Untouched** (no reconcile files in `76d4283`; reconcile only exists as pre-existing user change in `8ad4e54` + its test) ✅ |
| Payment state machine | `verify` return gained `fulfillmentId`; `createExpressFixFulfillment` writes `FULFILLMENT_CREATED`/`PAYMENT_SUCCESS` events — additive, not altering existing payment state transitions ✅ |
| Idempotency | `getOrCreateForAudit([email,auditId])` + `updateMany(... paymentId:null/fulfillmentId:null)` guards prevent overwrite; duplicate detection in `verify` preserved (existing `checkout.test.ts` asserts duplicate path) ✅ (structural; runtime DB unverified §11) |
| Cross-feature coupling | `verify` now also writes a **lead** + **2 funnel events** — this coupling is the **new untested surface** (F7). Billing-adjacent but not billing-state-breaking. |
| Migration | additive (2 new tables), drift-free, reversible (drop FunnelEvent → ExpressFixLead) ✅ |

**Conclusion**: No unresolved payment/reconciliation regression is introduced. The only billing-*adjacent* gap is test coverage of the new lead/funnel coupling in `verify` (§10), which is a quality-gate item, not a billing-state blocker.

---

## 13. EXACT PRE-3B GATE (strict)

Phase 3B **may** start only when all of the following are resolved **and merged**:

**SECURITY / PRIVACY**
- [ ] **F1 disposition decided + implemented**: `clientIp` removed or anonymized from funnel `data`; retention/deletion decision recorded; `/privacy` disclosure updated if IP retained.
- [ ] **F3 authorization reviewed + remediated**: `PATCH /admin/express-fix/:id/status` moved off `ADMIN_DASHBOARD_VIEW` to `BILLING_MANAGE` or new `ADMIN_EXPRESS_FIX_MANAGE`.
- [ ] **F2 API error semantics reviewed + implemented**: funnel endpoint returns 400 / 404 / 500 / (204|200) per §5 contract; no blanket 200-on-error.

**CONTRACT**
- [ ] **F5 evidence DTO shape resolved**: canonical `evidence` type (JSON) in shared DTO + frontend; both audit producers aligned; `sanitizeEvidence` typed.
- [ ] **Unused/partial contracts identified**: §9 inventory reviewed; funnel endpoint wired or explicitly deferred with a written decision.

**UI**
- [ ] **F4 Badge regression resolved**: `.badge-warning` + `.badge-purple` (+ fate of `error/emerald/indigo/slate`) added; no unstyled badges on any route.
- [ ] **375px foundation preserved**: `styles.css` 480px/overflow tokens intact; Phase 3B homepage must not regress mobile foundation.

**TESTING**
- [ ] **Minimal funnel-contract API test** (F1+F2 semantics) executes green in the available environment.
- [ ] Full §10 suite scheduled; **DB/Redis §11 checklist** run where the environment permits; unresolved infra items explicitly logged as `UNVERIFIED`, not failures.

**BILLING**
- [ ] No unresolved payment/reconciliation regression introduced (verified §12); new verify lead/funnel coupling has at least one unit/integration test.

**Rule**: Phase 3B UI work that does **not** touch funnel/billing/admin surfaces may be scaffolded in parallel, but the funnel result page (which consumes F5 evidence and drives F1/F2) is **frozen** until the gate items above are merged.

---

## 14. RECOMMENDED REMEDIATION ORDER

1. **F4 Badge CSS** (P2, 30-min, unblocks all UI incl. 3B) — also lowest risk.
2. **F1 Client-IP removal** (P1, 3-line + tests) — nothing depends on it.
3. **F2 Funnel error contract** (P2, small but needs the decision in §5) — pairs with F1 since same file.
4. **F5 Evidence type contract** (P1, type-only + alignment of the two producers + tests).
5. **F3 Admin authz** (P2, RBAC + route gate) — can follow, admin-side.
6. **F7 test suite** (§10) — write alongside 1–5, run once DB env available.
7. **F6 partial features** (P3) — wire admin queue UI + funnel client as **post-3B** or clearly-scoped follow-ups; remove or wire `FIRST_CUSTOMER_MODE`.

Order minimizes risk: resolve the UI-blocking + privacy + contract items first; keep admin-side and deferred features last.

---

## 15. DEFINITION OF DONE (per finding)

| Finding | Done when |
|---------|-----------|
| F1 | `clientIp` absent from funnel `data` (or anonymized); `/privacy` updated if retained; test asserts no IP; no schema change needed |
| F2 | Funnel route returns 400/404/500/(204|200) per §5; blanket 200-on-error removed; API test green |
| F3 | Status-transition endpoint gated by `BILLING_MANAGE` or `ADMIN_EXPRESS_FIX_MANAGE`; RBAC + integration test green |
| F4 | `.badge-warning`/`.badge-purple` (+ resolved raw classes) exist; no unstyled badge on any route; visual/browser test green |
| F5 | `evidence` typed as `JsonValue \| null \| undefined` consistently in shared DTO + frontend; both producers aligned; unit + contract test green |
| F6 | Inventory decision recorded (wire/defer/remove per-feature); no dead config left unexplained |
| F7 | §10 test suites written; green where environment permits; `UNVERIFIED` items explicitly logged |
| Billing | No payment/reconciliation regression; verify lead/funnel coupling unit-tested |

---

## 16. PHASE 3B READINESS DECISION

**NOT READY FOR PHASE 3B.**

### Minimum blocking items (resolve & merge before Phase 3B funnel UI work)
1. **F1 — Client-IP privacy**: remove/anonymize `clientIp` from `POST /scan/:scanId/funnel` `data`; decide retention; update `/privacy` if retaining. *(P1; Phase 3B activates this endpoint.)*
2. **F2 — Funnel error contract**: return 400 on malformed input, 404 (keep) for missing scan, 500 for server failure, 204/200 on success — stop returning blanket `200 {success:true}`. *(P2; Phase 3B is the endpoint's first real client.)*
3. **F5 — Evidence contract**: type `evidence` as JSON (not `string \| null`) in DTO + frontend; align both audit producers. *(P1; Phase 3B renders evidence on the result page.)*
4. **F4 — Badge CSS**: add `.badge-warning`/`.badge-purple` (+ resolve `error/emerald/indigo/slate`) so Phase 3B-authored badges render correctly. *(P2; prevents compounding visual regression on 3B UI.)*

**Explicitly non-blocking for Phase 3B start but scheduled immediately after:** F3 (admin authz), F6 (partial features), full F7 suite + §11 DB/Redis verification, and the billing verify lead/funnel coupling test.

---

*End of Phase 3A.6 Pre-3B Risk Remediation Plan. Planning-only; no code, schema, migration, tests, or dependencies were modified.*
