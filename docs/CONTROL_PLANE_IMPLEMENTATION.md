# Internal Control Plane + Customer 360 + ROI Intelligence — Implementation

**Date:** 2026-09-04 · **Method:** Direct implementation against `docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md`'s remaining P1 recommendation set, following the Revenue Foundation phase. Fresh Phase-0 repository audit confirmed the R&D document's own status: revenue/refund/Customer-360-endpoint/Bull-Board were already real (Revenue Foundation), and this phase's job was the *operating layer* around them — internal RBAC, Customer 360 UI, health, ROI trend, funnel-event extension, security-event visibility, and a thin operations/revenue dashboard — deliberately not every admin feature (per the phase's own explicit scope limit).

---

## 1. Internal RBAC

Extends the Revenue Foundation phase's flat `platformCapabilities: String[]` with a **named role layer** (`PlatformRole` enum on `User.platformRole`), additive and backward-compatible:

- **Capabilities added this phase:** `PLATFORM_VIEW`, `CUSTOMER_VIEW`, `CUSTOMER_MANAGE`, `AUDIT_LOG_VIEW`, `PLATFORM_ROLE_MANAGE` (joining the six from Revenue Foundation: `FINANCE_VIEW`, `REFUND_ISSUE`, `OPERATIONS_VIEW`, `OPERATIONS_MANAGE`, `CUSTOMER_360_VIEW`, `SECURITY_VIEW`).
- **Roles:** `OWNER` (all 11 capabilities), `FINANCE` (`FINANCE_VIEW`, `REFUND_ISSUE`, `PLATFORM_VIEW`), `OPERATIONS` (`OPERATIONS_VIEW`, `OPERATIONS_MANAGE`, `PLATFORM_VIEW`), `SECURITY` (`SECURITY_VIEW`, `AUDIT_LOG_VIEW`, `PLATFORM_VIEW`), `SUPPORT` (`CUSTOMER_VIEW`, `CUSTOMER_360_VIEW`, `PLATFORM_VIEW`), `ANALYST` (`PLATFORM_VIEW`, `FINANCE_VIEW`, `CUSTOMER_360_VIEW` — read-only, no `_MANAGE`/`_ISSUE` capability in its list). A role is **unioned** with a user's explicit `platformCapabilities` at check time (`getEffectivePlatformCapabilities()` in `rbac.ts`) — never a replacement, so a user can hold a role *and* extra ad-hoc capabilities.
- **Not built:** `SUPER_ADMIN`, `MARKETING`, `CUSTOMER_SUCCESS`, `DEVELOPER` — no surface this phase needs them; `OWNER` already covers the "full access" case the R&D document's own instruction ("do not implement every role if the current system does not need it") argues against duplicating.
- **Administration surface:** `GET /admin/platform-roles` (list platformAdmin users + their role/capabilities) and `PATCH /admin/platform-roles/:userId` (set role/capabilities), both gated by `PLATFORM_ROLE_MANAGE`, both requiring the caller's **current password** (re-authentication, same pattern as refund issuance), both audit-logged (`PLATFORM_ROLE_CHANGED`). Three hardcoded safety rules in `platformRoleService.ts`: a caller cannot modify their own role (self-escalation/self-lockout guard), only an existing `OWNER` can grant the `OWNER` role to someone else (privilege-escalation guard), and a role/capability can only be assigned to a user who is already `platformAdmin=true` (this is *internal* RBAC layered on top of that boolean gate, not a replacement for it, matching the phase's explicit instruction).
- **Migration backfill:** every pre-existing `platformAdmin=true` user was granted all 11 capabilities and `platformRole=OWNER` — no existing admin lost access, and at least one user can immediately use the new role-administration endpoints.
- **Not locked out**: verified directly — `tests/admin/admin-rbac.test.ts` and `tests/security/input-validation.test.ts` (pre-existing suites whose fixture platformAdmin users needed `platformRole: 'OWNER'` added, since four existing admin routes — `/admin/metrics`, `/admin/organizations` [list], `/admin/organizations/:id/status`, `/admin/audit-logs` — now also require a specific capability) still pass.

## 2. Admin Audit Foundation

No redesign. New actions recorded via the existing `adminService.recordAdminAction()`/`AdminAuditLog`: `PLATFORM_ROLE_CHANGED` (this phase). Refund/queue/customer-status actions were already covered by the Revenue Foundation phase. `customer_360_accessed` remains a structured console log (not `AdminAuditLog`) since it's a *read*, not a privileged write — matching this phase's own instruction that only write actions require an audit record.

## 3. Customer 360 admin experience

`GET /admin/organizations/:id` (Revenue Foundation's endpoint) extended with three new fields — `revenue.currentMrr`/`currentArr` (per-org MRR via `revenueIntelligenceService.getOrgMrr()`), `businessImpactTrend` (§5 below), and `health` (§4 below) — plus a **stricter sub-gate**: the `security` panel is only populated when the caller *also* holds `SECURITY_VIEW` (checked inline in the route, computed via `getEffectivePlatformCapabilities()`), even though `CUSTOMER_360_VIEW` alone is enough to reach the endpoint at all. A caller without it sees `{status: 'RESTRICTED', reason: ...}` instead — verified by a dedicated test.

The **frontend page** (`apps/web/src/features/admin/CustomerDetailView.tsx`, at `/admin/organizations/:id`) renders: header (name/status/created/health band), revenue panel (MRR/ARR/collected/failed/recent refunds/plan/renewal date), product-usage panel (websites/audits/monitoring/reports), business-impact-trend panel (with its own disclaimer inline), agency panel (rendered only when `agency !== null`), security panel (shows the restricted-reason message when the caller lacks `SECURITY_VIEW` — never silently hides the section, so an operator knows *why* it's empty), activity timeline (FunnelEvent + AdminAuditLog, already bounded server-side), and members list. Linked from `AdminOrgsView.tsx` via a "View 360" button per row. Verified in a real (headless Chromium) browser via `tests/e2e/control-plane.spec.ts` — the Chrome extension bridge wasn't available in this environment, so Playwright (already the repo's deterministic E2E tool) was used instead, per this repo's own tooling guidance.

## 4. Customer Health Score v1

`apps/api/src/services/customerHealthService.ts` — computed on read, no `CustomerHealthSnapshot` table, no background job (per explicit instruction). Signals: active websites, audits in the last 30 days, active monitoring configs, unresolved critical/high findings (see the important caveat below), subscription status, payment failures in the last 30 days, days until renewal. No support-domain signal, since none exists yet.

**"Unresolved" caveat**: `AuditFinding` has **no `resolvedAt` column** (confirmed by direct schema inspection — only `MonitoringAlert`/`VaultAuditFinding` have one). "Unresolved" here means "still present in the most recent audit for that website," not a stateful resolution flag — documented explicitly in the code, not silently assumed.

**Threshold calibration**: the environment has 254 organizations but only 98 audits and 25 active monitoring configs — almost entirely test/dev fixture data from this engagement's own suites, not an organic customer base (checked directly via `psql` before writing any threshold, per the phase's explicit instruction). Every score weight and band cutoff (`HEALTHY >= 70`, `NEEDS_ATTENTION 40-69`, `AT_RISK < 40`) is a **documented, provisional** judgment call — the code's own header comment says so explicitly, and the API response includes `provisional: true`.

**Explainability**: every result includes a `reasons: string[]` array of plain-language sentences (e.g. "2 critical finding(s) remain unresolved in the most recent audit") — never a bare number. `trend` is always `{status: 'NOT_AVAILABLE', reason: ...}` since no historical health snapshot exists yet — never fabricated.

## 5. Business Impact Trend

`apps/api/src/services/businessImpactTrendService.ts` — read-time only, no new storage; reads existing `Audit.businessImpact` snapshots (`packages/shared/src/business-impact.ts`'s `BusinessImpact.estimatedOpportunityLoss`) across a period (`{days: 7|30|90}` or a custom `{start,end}` range). Returns first/latest/min/max/change/percent-change readings, plus `findingsResolved`/`findingsIntroduced` computed by diffing `AuditFinding.normalizedIssueKey` sets between the earliest and latest audit in the period. Returns `status: 'INSUFFICIENT_DATA'` (not zero) when no completed audit with a business-impact snapshot exists in the period.

**Semantic safety**: every field is named `estimatedRisk*`/`observedChange`, never "revenue recovered" or "money saved." A `disclaimer` string accompanies every result, explicitly naming and rejecting that framing. Verified by a dedicated test that the customer-facing `summary` string and field names never claim cash recovery (the disclaimer itself is allowed to name the forbidden phrase, since its whole job is to reject it).

## 6. Core Funnel Events

Extends `FUNNEL_EVENTS` (in `apps/api/src/services/funnelEventService.ts`, and a **necessarily duplicated** subset in `apps/worker/src/audit/funnelEventService.ts` — see the architecture note below) with: `USER_SIGNED_UP`, `ORGANIZATION_CREATED` (registration route), `AUDIT_STARTED`/`AUDIT_COMPLETED` (orchestrator.ts, at the exact atomic-claim-won and finalization points, so a rejected duplicate-delivery attempt never double-emits), `REPORT_GENERATED` (both report-snapshot creation paths), `SUBSCRIPTION_STARTED`/`SUBSCRIPTION_RENEWED`/`SUBSCRIPTION_CANCELLED` (billingService.ts — the renewal branch is a **new, additive** addition, since the existing webhook handler previously silently no-op'd on a renewal charge against an already-ACTIVE subscription, never even updating `currentPeriodEnd`), `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` (core billing webhook, explicitly guarded against double-firing with the pre-existing guest-Express-Fix funnel events), `REFUND_SUCCEEDED`, `MONITORING_STARTED`, `PROSPECT_CREATED` (one aggregate event per bulk-import batch, not per row), `PITCH_SENT` (fires at generation-completion, since this codebase has no separate dispatch step — documented, not silently assumed), `FINDING_OPENED`/`FINDING_RESOLVED` (one aggregate event per audit, diffing `normalizedIssueKey` sets against the prior audit for the same website — skipped entirely for a website's first-ever audit, since there is nothing to compare against).

**Not implemented**: `PROSPECT_CONVERTED` — no distinct state-transition call site exists for this in the codebase (prospect status is only ever read as an aggregate, never explicitly set to `CONVERTED` by any route found); `REPORT_VIEWED` — explicitly optional per the phase's own "at minimum investigate" wording, deferred to avoid instrumenting a routine, potentially high-volume customer-facing read path without a clear consumer for that specific signal yet.

**Architecture correction made mid-phase**: the funnel-event vocabulary/recorder was initially moved to `packages/shared/src/server-only/` (matching the Revenue Foundation phase's `email-provider.ts`/`secret-encryption.ts` precedent, since both `apps/api` and `apps/worker` need it) — this was **wrong** and reverted after `tests/architecture.test.ts`'s boundary test (`packages/shared` must never import `@leadguard/database`/`@prisma/client`) caught it. The implementation is small (~90 lines) and is instead genuinely duplicated as `apps/worker/src/audit/funnelEventService.ts` (worker-only subset: `AUDIT_STARTED`/`AUDIT_COMPLETED`/`FINDING_OPENED`/`FINDING_RESOLVED`) and `apps/api/src/services/funnelEventService.ts` (full vocabulary) — both documented as needing to be kept in sync by hand if either changes.

## 7. Security Event Control Plane

`GET /admin/security-events` (gated `SECURITY_VIEW`) — paginated (bounded, max 100), filterable by `type`/`organizationId`/`userId`/`from`/`to`. Severity is classified via a lookup table (`adminSecurityEventService.ts`) covering all 13 pre-existing event types plus the two new ones below; an unrecognized type defaults to `MEDIUM` (visible, not silently `INFO`).

**New signals added** (the three the phase asked to evaluate):
- **SSRF blocks**: recorded at the two genuinely highest-signal call sites — webhook endpoint URL registration (`webhookService.createEndpoint`) and website URL registration/update (`routes.ts`) — all three are authenticated, customer-controlled URLs the system later fetches server-side. Deliberately **not** added to every public-facing URL-validation call site (guest scan, public audit), since those would flood the table with routine invalid-input noise rather than a meaningful abuse signal. A real, pre-existing gap was found and fixed alongside this: `POST /websites` and `PATCH /websites/:id` returned a generic 500 on SSRF rejection instead of a proper 400 (the same mapping `POST /webhooks` already had) — fixed and covered by a test.
- **Rate-limit abuse**: `createRedisRateLimiter` (shared by every limiter — auth, API, webhook, etc.) now tracks a separate, longer-window violation counter per client+limiter; a `RATE_LIMIT_ABUSE_<PREFIX>` event fires only after 5 sustained violations, then resets — a single 429 (a legitimate client retrying too fast) never generates an event. This single change covers both "rate-limit abuse" and "suspicious webhook abuse" (the webhook-specific limiter's own sustained trips) without a separate code path.
- **Sensitive admin actions**: already covered by `AdminAuditLog` (§2); not duplicated into `SecurityEvent`.

## 8. Operations Control Plane

Bull Board (Revenue Foundation) is unchanged and remains the actual queue-mutation UI. `GET /admin/operations/summary` (gated `OPERATIONS_VIEW`) adds a thin, read-only job-count rollup across the same 8 real queues via BullMQ's own `getJobCounts()` — no second queue system. The frontend `OperationsView.tsx` shows the rollup table plus a link out to the full Bull Board UI for any actual retry/promote/remove action (still capability-gated + audit-logged exactly as the Revenue Foundation phase left it).

## 9. Revenue Dashboard

`RevenueDashboardView.tsx` — a thin frontend over the *existing* `GET /admin/revenue/summary` endpoint (no new backend route). Shows MRR/ARR/New MRR/Churned MRR/collected/failed, an explicit "As of \<timestamp\>" line, a period selector (today/current month/previous month), and Expansion/Contraction MRR rendered as `Unsupported` cards with their exact documented reasons — never a fabricated number, never `0`.

## 10. Permissions (cross-reference)

See §1 for the full role/capability table. Every new/modified route's exact gate:

| Route | Gate |
|---|---|
| `GET /admin/platform-roles`, `PATCH /admin/platform-roles/:userId` | `PLATFORM_ROLE_MANAGE` |
| `GET /admin/security-events` | `SECURITY_VIEW` |
| `GET /admin/operations/summary` | `OPERATIONS_VIEW` |
| `GET /admin/metrics` | `PLATFORM_VIEW` (newly added) |
| `GET /admin/organizations` (list) | `CUSTOMER_VIEW` (newly added) |
| `PATCH /admin/organizations/:id/status` | `CUSTOMER_MANAGE` (newly added) |
| `GET /admin/audit-logs` | `AUDIT_LOG_VIEW` (newly added) |
| `GET /admin/organizations/:id` security panel | `CUSTOMER_360_VIEW` **and** `SECURITY_VIEW` |

## 11. Security boundaries

- Every new endpoint requires `requirePlatformAdmin()` **and** a specific capability — no route relies on the boolean alone (per Phase 1's explicit instruction).
- Cross-tenant leakage: verified by tests on security-events (`organizationId` filter never returns another org's events) and the extended Customer 360 payload (org-scoped throughout, unchanged from Revenue Foundation's own guarantee).
- Bull Board: unchanged, still never public, still sanitized/audited (Revenue Foundation).
- Re-authentication: platform-role changes require the caller's current password, same as refund issuance.

## 12. Known limitations

- `GET /admin/platform-roles` is **not paginated** — the set of `platformAdmin=true` users is naturally small and bounded (unlike the general user/organization tables), so this is a deliberate scale-appropriate judgment call, not an oversight; revisit if the platform-admin population ever grows into the hundreds.
- `GET /admin/security-events`'s `from`/`to` query params are not validated against malformed date strings before being passed to Prisma — an invalid date silently produces `Invalid Date`, which Prisma will simply not match against rather than throwing a 400. Low-severity (operator-only endpoint, not customer-facing).
- `PROSPECT_CONVERTED` and `REPORT_VIEWED` funnel events are not implemented — see §6.
- Customer health thresholds are explicitly provisional (§4) — recalibrate once real, non-fixture usage data exists.
- No genuine historical health-score trend (only "not available") — would require a snapshot table, explicitly out of scope for v1.
- The two `FUNNEL_EVENTS` vocabularies (`apps/api` and `apps/worker`) must be kept in sync by hand — see §6's architecture note.
