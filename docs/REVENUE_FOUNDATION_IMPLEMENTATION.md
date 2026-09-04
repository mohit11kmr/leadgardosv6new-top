# Revenue Foundation + Operational Control — Implementation

**Date:** 2026-09-03/04 · **Method:** Direct implementation against `docs/REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md`'s P0 recommendation set (§24, §27), verified by real test execution against Postgres/Redis, not by inspection alone.

This document records what was actually built, its exact semantics, and — as important — what was deliberately *not* built or left honestly unsupported. See the R&D document's §28 for a finding-by-finding resolution status.

---

## 1. Revenue metric semantics — general rules

Every metric is a **read-time PostgreSQL aggregation**, computed on demand in `apps/api/src/services/billing/revenueIntelligenceService.ts` — there is no materialized/rollup table, no scheduled snapshot job, and no new event-ledger dependency. This matches the R&D document's own conclusion (§11): the gap was a missing calculation layer, not missing data.

Non-negotiable rules baked into the code (see the module's own header comment, which repeats this so a future editor can't violate it silently):

- **MRR is never derived from `Payment`.** It comes only from `Subscription` + `Plan`. A payment is evidence money moved; a subscription is evidence of a recurring commitment. Conflating them would make MRR spike/dip with one-off payment timing noise.
- **"Collected revenue" is never called MRR**, and is never netted against refunds unless a metric is explicitly named "net". `getCollectedRevenue` sums `CAPTURED + REFUNDED + PARTIALLY_REFUNDED` — all three are post-capture states, so summing them is the gross captured amount, by design.
- **Money is integer paise everywhere.** The only division in the entire service is yearly→monthly plan-price normalization (`Math.round(priceInPaise / 12)`); no float is ever summed or persisted.
- **All period boundaries are UTC**, computed via `Date.UTC(...)`, never a server-local or per-user timezone. This is a company-wide metric, not a per-viewer display value.

## 2. MRR calculation

`getCurrentMrr()` runs:

```sql
SELECT DISTINCT ON (s."organizationId") p."priceInPaise", p."billingInterval"
FROM "Subscription" s JOIN "Plan" p ON p.id = s."planId"
WHERE s.status = 'ACTIVE'
ORDER BY s."organizationId", s."createdAt" DESC
```

`DISTINCT ON (organizationId)` is the double-counting guard: if an organization somehow has more than one row with `status = 'ACTIVE'` (a data-integrity edge case the schema doesn't currently prevent — see §13), only the most recently created one is summed. This is proven, not assumed — `tests/billing/revenue-intelligence.test.ts` seeds exactly that edge case (two simultaneously-ACTIVE rows for one org) and asserts the sum still reflects only one of them.

`ONE_TIME`-interval plans contribute `0` to MRR by definition (they're not recurring). `YEARLY` plans are normalized to `Math.round(priceInPaise / 12)`.

## 3. ARR

`getCurrentArr(mrr) = mrr.amountInPaise * 12` — a pure derivation of the same MRR snapshot, not an independently-queried figure. There is exactly one source of truth for the monthly figure.

## 4. New MRR / Churned MRR

- **New MRR**: subscriptions whose `createdAt` falls inside the requested period **and** whose *current* status is `ACTIVE` or `TRIALING`. A subscription that started and was also cancelled within the same period is deliberately excluded here (see the code comment) rather than being double-modeled into both New and Churned — this service does not yet track point-in-time historical MRR snapshots, so "New" and "Churned" are both evaluated against current status, not a historical state machine.
- **Churned MRR**: subscriptions with status `CANCELLED`/`EXPIRED` whose churn timestamp — `COALESCE(canceledAt, updatedAt)` — falls inside the period. `canceledAt` is only ever set by an explicit cancellation; an automatic `EXPIRED` transition has no dedicated timestamp column in the current schema, so `updatedAt` is used as the best available proxy. This is stated as an assumption, not a guarantee.

Both are tested for the two invariants that matter most: a subscription created *before* the period is never counted as New (only created *inside* it), and cancelled/expired subscriptions never leak into current MRR.

## 5. Refund lifecycle

New first-class `Refund` model (`packages/database/prisma/schema.prisma`), enum `RefundStatus = REQUESTED | APPROVED | PROCESSING | SUCCEEDED | FAILED | CANCELLED`.

**Implemented state machine**: `REQUESTED -> PROCESSING -> SUCCEEDED | FAILED`, all inside `RefundService.requestAndIssueRefund()` (`apps/api/src/services/billing/refundService.ts`):

1. Idempotency short-circuit (see §6).
2. Re-authentication: the caller's **current password** is re-verified via `verifyPassword`, independent of their JWT's validity — a money-moving action's own safeguard, not just "already logged in."
3. Input validation (positive amount, non-empty reason).
4. A DB transaction takes a row lock (`SELECT ... FOR UPDATE`) on the `Payment` row, re-checks its status is refundable (`CAPTURED`/`PARTIALLY_REFUNDED`), computes `remaining = payment.amountInPaise - SUM(non-failed/cancelled refunds against it)`, and rejects if the requested amount exceeds `remaining`. The row lock makes this check race-free under concurrent requests — proven by a real concurrent-request test (two simultaneous 70k refund attempts against a 100k payment; exactly one succeeds).
5. A `Refund` row is created (`REQUESTED`, `approvedByUserId` set equal to `requestedByUserId` — see below), then immediately moved to `PROCESSING`.
6. `razorpayProvider.refundPayment()` is called. On success, `Refund.status = SUCCEEDED` and `Payment.status` is updated to `REFUNDED` (if the cumulative refunded amount now equals the captured amount) or `PARTIALLY_REFUNDED`, in the same transaction. On failure, `Refund.status = FAILED` with `failureReason` set — a refund is **never** left stuck at `PROCESSING`, and is never marked `SUCCEEDED` before the provider actually confirms it.

**`APPROVED`/`CANCELLED` are schema-only, not exercised.** The current RBAC model has no genuine two-person maker-checker distinction (one platform-admin capability, `REFUND_ISSUE`, not a separate "request" vs. "approve" role), so building a fake two-step approval UI on top of it would misrepresent what actually happened. The single implemented flow honestly records `approvedByUserId = requestedByUserId` rather than leaving the field ambiguous or fabricating a second approver. A genuine maker-checker flow is a clearly scoped future addition once a second capability/role exists to back it.

## 6. Refund idempotency

Two independent layers:

- **Local**: `Refund` carries `idempotencyKey` (client-supplied, optional) under `@@unique([organizationId, idempotencyKey])`. A retried call with the same key returns the *original* `Refund` row untouched, before any validation re-runs — proven by a dedicated test.
- **Provider**: the local `Refund.id` (not the client key) is passed as Razorpay's own `X-Razorpay-Idempotency-Key` header on every refund call, so even if the local uniqueness check somehow raced, the provider-side call is independently idempotent too.

## 7. Customer 360 API

`GET /admin/organizations/:id` → `getOrganizationDetail()` (`apps/api/src/services/adminCustomer360Service.ts`). Every child query (members, subscription, revenue, refunds, website/audit/report/monitoring counts, agency counts, security events, funnel events) runs in a single `Promise.all` — no N+1, verified by a response-time smoke test independent of child-row count. Every query is filtered by the exact `organizationId` param; there is no code path that can return another organization's data (verified by a dedicated cross-tenant test). Nothing that could carry a secret (`passwordHash`, `tokenHash`, `keyHash`, webhook `secretHash`, `SecurityEvent.metadata`) is ever selected.

`recentAdminActions` is populated via a targeted join-by-value: `AdminAuditLog` has no `organizationId` column at all (a genuine, pre-existing schema constraint — it's a generic `resourceType`+`resourceId` log), so the only honest way to show "admin actions relevant to this org" is to look up `AdminAuditLog` rows whose `resourceId` matches a resource (currently: refund IDs) already confirmed to belong to this org in the same request. This is deliberately narrower than "every admin action touching this org" — it only surfaces refund-related actions today, which is stated plainly rather than silently pretending to be comprehensive.

## 8. Internal permissions (RBAC extension)

A **third**, additive tier alongside the existing two (org-scoped `Capability`/`PERMISSION_MATRIX`, and the single `platformAdmin` boolean): `User.platformCapabilities: String[]`, checked by `requirePlatformCapability(capability)` in `apps/api/src/middleware/rbac.ts`. Six capabilities: `FINANCE_VIEW`, `REFUND_ISSUE`, `OPERATIONS_VIEW`, `OPERATIONS_MANAGE`, `CUSTOMER_360_VIEW`, `SECURITY_VIEW` (this last one reserved — no route currently checks it, since no new security-event viewer route was in scope for this phase).

`requirePlatformAdmin()` is completely unchanged — every existing admin route keeps its exact current behavior. The new capability check is additive on top of it (`requirePlatformAdmin() + requirePlatformCapability(X)`), never a replacement. Every existing `platformAdmin = true` user was backfilled, in a dedicated migration, with all six capabilities — no existing admin lost access to anything they could already do.

`requireOperationsCapability()` is a method-aware convenience wrapper: `GET` → `OPERATIONS_VIEW`, anything else → `OPERATIONS_MANAGE`, so the stronger check can never accidentally drift to the weaker one for a mutating request.

## 9. Bull Board security

`apps/api/src/admin/queueBoard.ts` mounts Bull Board over the **real, already-existing** 8 BullMQ queues (audit, monitoring, vault, report, webhook, agency-competitor, agency-prospect, agency-pitch) — never a hardcoded/fake list, never a new queue system.

- **Never public**: mounted at `/api/v1/admin/queues` behind `requirePlatformAdmin() + requireOperationsCapability()`, in front of Bull Board's own router — verified by a 401 (unauthenticated) and 403 (authenticated but missing capability) test.
- **Sanitized job data**: the webhook queue is the only queue, across every producer call site in the codebase, whose job payload carries a genuine secret (`secretHash`, the endpoint's webhook signing secret hash). A `Proxy`-wrapped `Queue` (`createSanitizingQueueProxy`) intercepts only `getJob`/`getJobs` — the two read paths Bull Board uses to render job details — and redacts `secretHash`/`secret`/`apiKey`/`password`/`token`/`refreshToken` fields before they're ever serialized. Every other queue's real `Queue` instance is registered directly (no wrapping needed — direct source inspection of every producer confirms no other queue's job data carries a secret). Verified by a test that seeds a real job with a known secret and asserts it never appears in the response, and that `[REDACTED]` does.
- **Audited mutations**: `auditBullBoardMutations()` intercepts every non-`GET` request reaching the board (retry/promote/clean/pause/obliterate/etc. — verified against Bull Board's actual route table in `@bull-board/api/dist/routes.js`, which is overwhelmingly `PUT`/`PATCH`, not `POST`) and writes an `AdminAuditLog` entry (`action: QUEUE_<METHOD>`, `resourceType: QUEUE_JOB`) before handing off to Bull Board's own handler — logging failure never blocks the underlying action. A path-based classifier (`classifyQueueMutation`) turns the request path into a specific structured-log event name (`queue_job_retried`, `queue_job_promoted`, `queue_job_removed`, `queue_job_paused_or_resumed`), since Bull Board's real routes put the action in the path, not the HTTP method — a purely method-based scheme would have collapsed nearly everything into one generic bucket.

## 10. Admin audit

No redesign — the existing generic `AdminAuditLog` (`{userId, action, resourceType, resourceId, details, ipAddress, createdAt}`, no `organizationId` column) and `adminService.recordAdminAction()`/`listAdminAuditLogs()` already worked, unmodified, for the two new resource types this phase introduces (`REFUND`, `QUEUE_JOB`). New actions captured: `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_SUCCEEDED`, `REFUND_FAILED` (refundService.ts), `QUEUE_GET`/`QUEUE_PUT`/etc. for queue mutations (queueBoard.ts) — view-only queue access is deliberately **not** audit-logged (only mutations are), matching this phase's own instruction not to audit every read.

`customer_360_accessed` is logged (structured console log, not `AdminAuditLog`) on every successful Customer 360 access, since it's the single most customer-data-sensitive admin view in the system. There is deliberately **no** dedicated `customer_360_access_denied` log — no existing RBAC-gated route in this codebase (including every pre-existing `requirePlatformAdmin()`-only route) logs authorization denials as a distinct event; adding one only for this endpoint would invent a new, inconsistent pattern rather than follow the codebase's existing convention. This is a known, deliberate limitation (§13), not an oversight.

## 11. Password reset delivery

`authSecurityService.requestPasswordReset()` now actually sends mail: it builds `resetUrl = ${config.APP_URL}/reset-password?token=${rawToken}` and calls the shared `emailProvider.sendEmail()` (the same `SmtpEmailProvider`/nodemailer stack already proven for Watchdog monitoring alerts — moved into `packages/shared/src/server-only/email-provider.ts` so both `apps/api` and `apps/worker` consume one implementation, not two independent ones). The send is `await`ed (not fire-and-forget) so tests can assert on completion, but wrapped in try/catch — a delivery failure is logged (`password_reset_email_failed`) and never thrown past the caller, so it can't leak account existence (an error only for real accounts) or leak infrastructure state to an unauthenticated caller. **The raw token and the reset URL are never logged**, anywhere, in success or failure — verified by a dedicated test that inspects every log call.

## 12. Email verification

Same delivery mechanism as §11. One genuine bug fixed in the same pass: `requestEmailVerification()` previously had **no check** for an already-verified email — it would silently issue a fresh verification token (and now would resend an email) even to a user whose address was already confirmed. It now returns early with `{ message: 'This email address is already verified.', alreadyVerified: true }` before creating any token or sending any mail — verified by a dedicated test asserting `sendEmail` is never called in that case.

## 13. Known limitations (do not silently drop these)

- **No genuine two-person refund approval.** `APPROVED`/`CANCELLED` refund states exist in the schema but aren't exercised — see §5. A single `REFUND_ISSUE`-capable admin can both request and "approve" (self-approve, honestly labeled) a refund.
- **No database-level constraint preventing more than one `ACTIVE` subscription per organization.** The MRR calculation layer defends against this (`DISTINCT ON`), and it's covered by a test, but the underlying data model does not *prevent* the anomaly at the schema level — only the read layer is hardened against it.
- **Expansion MRR and Contraction MRR are explicitly `UNSUPPORTED`**, not computed with a best-effort guess. The schema has no reliable before/after plan-comparison signal for either (see the code's own documented reasons). Returning a fabricated number here was explicitly rejected per this engagement's no-fake-data rule.
- **`customer_360_access_denied` is not a distinct logged event** — see §10. Denials return a normal 403 JSON error; only successful access is logged as a named event.
- **Customer 360's `recentAdminActions` only surfaces refund-related admin actions today** — see §7. It is not a comprehensive "every admin action touching this org" feed, because the schema has no way to make that query without inventing a join that doesn't exist.
- **No Customer 360 UI, no health-score UI, no coupon/discount engine** — all explicitly out of scope for this phase per the phase's own "do NOT build" list; this phase is the API/data foundation those would read from.
- **`SECURITY_VIEW` capability is defined but unused** — reserved for a future admin security-event viewer route, not wired to anything in this phase.
