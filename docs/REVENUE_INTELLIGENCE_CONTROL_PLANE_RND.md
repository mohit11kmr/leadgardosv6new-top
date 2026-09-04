# Revenue Intelligence + Customer 360 + Company Control Plane — R&D

**Date:** 2026-09-03 · **Method:** Fresh source-code audit (Prisma schema, billing/admin/agency services, RBAC, security-event and event-ledger call sites — not assumed from prior docs) + external research into Stripe/Chargebee/Intercom/Zendesk/Gainsight/HubSpot/ChurnZero/LaunchDarkly/Bull Board patterns. This is R&D only — **no application code was modified** to produce this document, per this phase's explicit instruction.

This document builds directly on `docs/LEADGUARD_OS_BLUEPRINT.md`, which already did substantial work on this exact ground (§00-18: control-plane domain table, data-domain ownership, master gap analysis, decision register, roadmap). **This document does not duplicate that work — it corrects four claims in it that fresh evidence shows are now stale, and goes deeper on five areas that document only sketched: Customer 360 information architecture, revenue-metric source-of-truth, event/ledger strategy, a customer health model, and the revenue-impact-to-ROI semantic chain.**

---

## 1. Executive Summary

LeadGuard's customer-facing product (audits, findings, business-impact, agency prospecting, Watchdog) is genuinely mature — this was independently re-confirmed across three prior phases of work in this engagement. Its **internal operating layer is not**: the company cannot currently answer "how much money came in this month" without a database query, cannot issue a refund without going around the product entirely (into the Razorpay dashboard directly, leaving no local record), and has exactly one admin action type under audit-log coverage (blog post CRUD) despite an admin audit-log table that's ready for anything.

**The single most important correction to the prior blueprint**: three of its "master gap analysis" findings have already been fixed since it was written, in the two detection-hardening phases that followed it — G-13 (monitoring scheduler "coded but never invoked"), part of G-14 (PDF "HTML mislabeled as PDF," and the S3-storage silent-fallback), are **resolved**. G-06 (SecurityEvent "used for 1 of ~5+ event types") is **also stale** — fresh evidence shows 13 distinct security-event types already recorded across auth and billing-fraud paths. Do not carry these forward as open gaps; they are corrected in §3 below.

**The single most important finding this phase adds**: LeadGuard already has the *right-shaped* infrastructure for an event ledger (`FunnelEvent` — generic, append-only, typed by a free-text `type` field, already proven in production) — it's just wired to one narrow funnel (the guest Express-Fix checkout) instead of the core subscription/agency/monitoring lifecycle. Extending it is a small, low-risk, already-validated-pattern change, not new architecture — this directly answers Rule 8's central question.

**Recommended posture**: do not build a Customer 360 page, a coupon engine, and an admin ops console all at once. Build the source-of-truth layer first (extend `FunnelEvent`, add a `Refund` model, add one `GET /admin/organizations/:id` join endpoint) — everything else (dashboards, health scores, coupon UI) is a thin read layer over that foundation, and building the thin layer before the foundation just produces a dashboard that lies.

---

## 2. Current Product Reality (delta from the blueprint, not a re-derivation)

The blueprint's §01/§00 reality check stands, **except**:

| Blueprint claim | Status | Fresh evidence |
|---|---|---|
| G-13: monitoring/retention jobs "coded but never invoked" | **STALE — fixed** | `apps/worker/src/worker.ts` calls `monitoringScheduler.start()` at boot; `tests/worker-wiring.test.ts` guards it; 25 passing tests across the monitoring suite (verified in the Detection Integrity phase of this engagement). |
| G-14: "PDF is HTML"; "S3 fallback silently uses local disk" | **STALE — both fixed** | `renderHtmlToPdf` uses real headless-Chromium `page.pdf()` (verified `%PDF-` magic bytes); a real `GET /reports/:id/pdf` download route now exists. The S3 silent-fallback was *already* fixed before this engagement's own work — `report-storage.ts`'s own code comment says config validation "already refuses to boot with REPORT_STORAGE=S3 unless S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY are set... never silently falls back to local disk **like it used to**." |
| G-06: SecurityEvent "used for 1 of ~5+ relevant event types" | **STALE — materially broader** | Fresh grep of `recordSecurityEvent(` call sites: **13 distinct types** already recorded — `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `REFRESH_REUSE_DETECTED`, `REFRESH_REJECTED`, `SUSPICIOUS_PAYMENT_SIGNATURE`, `SUSPICIOUS_PAYMENT_OWNERSHIP`, `RAZORPAY_PROVIDER_VERIFICATION_FAILED`, `RAZORPAY_WEBHOOK_INVALID_SIGNATURE`, `API_KEY_CREATED`, `API_KEY_REVOKED`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET`, `EMAIL_VERIFIED`. What's still genuinely true: no SSRF-block, rate-limit-abuse, or webhook-delivery-abuse events feed it, and **there is still no admin route to view `SecurityEvent` at all** (confirmed: zero `/admin/security*` routes exist) — that specific gap is real, just not "one event type." |
| G-15: email "MOCK provider only logs to console... broken account-recovery flow" | **PARTIALLY STALE — precise correction below** | Not accurate as a blanket claim. See §2a. |
| G-02: billing reconciliation "local-only linter, never talks to Razorpay" | **RE-VERIFIED, fully accurate** | Read the complete `billingReconciliationService.ts` (135 lines, not a skim): the only comparison logic that runs, in *any* mode, is inside `if (['TEST','MOCK'].includes(razorpayProvider.mode))` — format/prefix regex checks against the local record's own field shape. There is no branch, in LIVE mode, that calls the Razorpay API to fetch the real subscription/payment and diff it against the local row. In production (LIVE mode) this function only runs one trivial universal check (`amountInPaise > 0`) — it does not reconcile against provider truth at all. This is worse than "a local-only linter" undersold it — in LIVE mode it is barely a linter. |

### 2a. Email delivery — the precise correction

Two different things share the "email" label in this codebase, and they are in opposite states:

1. **Watchdog monitoring alerts** (`apps/worker/src/monitoring/notifications/emailProvider.ts`): a real `SmtpEmailProvider` using `nodemailer`, config-gated (`EMAIL_PROVIDER=SMTP` refuses to boot without `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`). This is genuinely fixed, evidenced by a passing regression test whose own name records the prior bug: *"SmtpEmailProvider > sends real mail through nodemailer instead of only logging to console."*
2. **Password reset / email verification** (`apps/api/src/services/authSecurityService.ts`): **zero email integration of any kind** — not even the console-logging mock. Direct grep confirms `apps/api` imports no email provider, no `nodemailer`, nothing. The code creates a `PasswordResetToken` row and returns the string *"password reset instructions have been dispatched"* — but nothing ever dispatches anything. A user who requests a password reset today receives a reassuring API response and **no way to actually reset their password**.

**Net correction**: email delivery is not "MOCK-only company-wide" — it's real for one subsystem (Watchdog) and completely absent (not even mocked) for the one flow where its absence is most damaging (account recovery). This is **more severe** than the blueprint's framing for this specific flow, and still a live P0.

---

## 3. Customer 360 Reality

Answering the blueprint's own question directly, re-verified: **"Who is this customer, what did they buy, what are they using, what's happening to their websites, what's been found, what's been paid, what's due, what was refunded, what support/security events happened, what's their health?" — cannot currently be answered from one place, and cannot even be answered by composing multiple admin API calls, because the single-organization admin detail endpoint doesn't exist.**

Direct evidence: the admin route surface has exactly `GET /admin/organizations` (list) and `PATCH /admin/organizations/:id/status` (suspend/restore) — **no `GET /admin/organizations/:id`** returning one org's joined picture. An operator today can see a list row or flip a status bit; nothing in between.

### Relationship inventory (Organization → ... chain from the task's own map)

| Relationship | Classification | Evidence |
|---|---|---|
| Organization → Users (OrganizationMember) | **REAL** | Modeled, RBAC-scoped, `GET /admin/users` exists |
| Organization → Websites | **REAL** | Modeled, full lifecycle |
| Organization → Audits → Findings | **REAL** | Deepest, most mature part of the system (three prior engagement phases hardened exactly this) |
| Organization → Reports | **REAL** | Report/ReportVersion/ReportShareLink, PDF now real+downloadable |
| Organization → Monitoring | **REAL, now verified running** | MonitoringConfig/Run/Finding/Alert, scheduler confirmed wired (§2) |
| Organization → Usage (UsageRecord) | **PARTIAL** | Real table, but only 4 metrics tracked (`AUDITS`, `WEBSITES`, `API_REQUESTS`, `MONITORING`) — no "reports generated," "findings resolved," no per-metric trend UI |
| Organization → Subscription | **REAL** | Plan/Subscription modeled, single active-subscription-per-org pattern |
| Organization → Orders/Payments | **REAL** | `Payment` model, `PaymentPurpose` distinguishes SUBSCRIPTION/EXPRESS_FIX/WATCHDOG/PLAN_UPGRADE — genuinely useful revenue-by-purpose granularity already exists |
| Organization → Invoices | **REAL** | Structured `Invoice` model with `billingAddress`/`taxInfo`/`pdfUrl` — more complete than expected |
| Organization → Refunds | **PARTIAL, not first-class** | `PaymentStatus` enum has `REFUNDED`/`PARTIALLY_REFUNDED` — a status flag exists, but there is **no structured refund amount, reason, or timestamp field** anywhere on `Payment`; a partial refund's actual ₹ amount is not queryable except inside an unstructured `metadata: Json?` blob, if it's even written there at all (no evidence found that it is) |
| Organization → Credits/discounts | **MISSING** | No model, confirmed by full-codebase search (§5) |
| Organization → Agency relationships (ClientWorkspace) | **REAL, but billing-disconnected** | `ClientWorkspace`/`ClientWorkspaceMember` real; **`Subscription`/`Payment` have no `clientWorkspaceId` field at all** — billing is organization-level only, so an agency operator cannot see recurring revenue *per client*, only per their own org total |
| Organization → API keys/webhooks | **REAL** | ApiKey/ApiUsage/WebhookEndpoint/WebhookDelivery all modeled with real telemetry (latency, status, attempts) |
| Organization → Support/activity | **NOT WIRED** | No support-ticket model of any kind; "activity" would need to be composed from `FunnelEvent` + `AdminAuditLog` + `SecurityEvent`, none of which currently cover the authenticated core-product lifecycle (§8) |
| Organization → Security events | **PARTIAL** | Real, 13 types (§2), but zero admin visibility |

**Verdict**: every individual piece Customer 360 would need to join already exists as real data, correctly org-scoped. What's missing is not data collection — it's (a) one join endpoint, and (b) two data domains (support timeline, refunds) that don't exist as first-class records yet.

---

## 4. Finance/Revenue Reality

Answering the 16 questions from Rule 3, each with source evidence:

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Money in today? | **PARTIAL** | `Payment` rows are queryable by `createdAt`, but no dashboard/query pre-built — would need a raw query today |
| 2 | Money in this month? | **PARTIAL** | Same — data exists, no rollup |
| 3 | MRR? | **NO** | No `Subscription`-to-MRR calculation anywhere in the codebase; `Plan.priceInPaise` × active-subscription-count is computable but not computed |
| 4 | ARR? | **NO** | Same — derivable, not derived |
| 5 | New MRR? | **NO** | Would require a `SUBSCRIPTION_STARTED`-shaped event stream, which doesn't exist yet (§9) |
| 6 | Expansion MRR? | **NO** | `PaymentPurpose.PLAN_UPGRADE` exists as a category, so the raw signal is captured, but no MRR-delta calculation consumes it |
| 7 | Contraction MRR? | **NO** | No downgrade-tracking signal found at all |
| 8 | Churned MRR? | **NO** | `SubscriptionStatus.CANCELLED`/`EXPIRED` exist, timestamped via `canceledAt`, but not aggregated into a churn-MRR figure |
| 9 | Refund amount? | **NO** | Per §3, no structured refund-amount field exists to sum |
| 10 | Failed payment amount? | **PARTIAL** | `PaymentStatus.FAILED` rows are queryable; no rollup |
| 11 | Revenue by plan? | **PARTIAL** | `Payment`→`Subscription`→`Plan` joinable today via a manual query; no pre-built view |
| 12 | Revenue by customer? | **PARTIAL** | Same — `Payment.organizationId` makes this a one-query answer, just not pre-built |
| 13 | Revenue by agency? | **NO** | Since billing is org-level (§3), "agency revenue" would mean the agency's own subscription only, not a rollup of what their clients generate — and clients aren't billed through LeadGuard at all in the current model (agencies presumably bill their own clients outside LeadGuard entirely) |
| 14 | Revenue by campaign? | **NO** | No campaign-attribution field on `Payment`/`Subscription` |
| 15 | Revenue by coupon? | **N/A** | No coupon system exists (§5) |
| 16 | Revenue by acquisition source? | **NO** | `Prospect.source`/`ProspectCampaign.source` exist for the agency-prospecting funnel specifically, but there's no acquisition-source field on `Organization`/`Subscription` for direct signups |

**Overall Finance/Revenue verdict**: the *ledger* (Payment, Invoice, Subscription, Plan) is real and structurally sound. The *intelligence layer* on top of it (MRR, churn, revenue-by-dimension) is **entirely absent** — every one of the 16 questions is either NO or "technically queryable via raw SQL, not answerable by the product." This is the single clearest, most consequential gap in the entire audit: **the company is flying blind on its own revenue**, not because the data doesn't exist, but because nothing computes it.

---

## 5. Commerce Reality

Full-codebase search (`coupon|discount code|referral code|creditGrant`, case-insensitive, across `apps/api`, `apps/worker`, and the Prisma schema) returns **zero matches**. This independently reconfirms the blueprint's G-08: there is no Coupon, Discount, Promotion, Campaign (commerce sense — `ProspectCampaign` is an agency-prospecting concept, unrelated), Trial-rules, Referral, or Credit-grant model or code path anywhere in the system. `SubscriptionStatus.TRIALING` exists as an enum value, meaning the *state* is representable, but there is no trial-duration-per-plan, trial-eligibility, or trial-conversion tracking logic anywhere that sets or reads it in a rule-driven way.

This is a full, not partial, gap — worth stating plainly rather than hedging: **LeadGuard cannot run a single promotion, discount, or trial campaign today without a code deploy**, exactly as Rule 4 anticipated and the blueprint already flagged.

---

## 6. Admin Control Plane Reality

The entire admin route surface, enumerated directly from `routes.ts` (17 routes total):

| Route | Domain | Classification |
|---|---|---|
| `GET /admin/metrics` | Platform metrics | **REAL** (read-only) |
| `GET /admin/funnel-analytics` | Funnel rollup | **REAL** (reads `FunnelEvent.groupBy`) |
| `GET /admin/users`, `PATCH /admin/users/:id/status`, `POST /admin/users/:id/revoke-sessions` | Customer (user) management | **REAL** |
| `GET /admin/organizations`, `PATCH /admin/organizations/:id/status` | Customer (org) management | **PARTIAL** — list + suspend only, no detail view (§3) |
| `POST /admin/billing/reconciliation` | Revenue | **PARTIAL** — triggerable, but the underlying logic barely checks anything in LIVE mode (§2) |
| `GET /admin/audit-logs` | Security/compliance | **REAL but nearly empty** — the log exists and is viewable, but only blog-CRUD actions are ever written to it (§8) |
| `GET/PATCH /admin/express-fix*` (3 routes) | Product ops (one-off fulfillment) | **REAL** |
| `/admin/blog*` (5 routes, full CRUD) | Content/marketing | **REAL** |

**Entirely absent from the admin surface**: refund issuance, coupon/campaign management (none exists to manage), plan/pricing management, manual credit grants, any queue/worker/job visibility, any `SecurityEvent` viewer, any single-customer detail view, any feature-flag toggle.

Rule 5's domain-by-domain classification:

| Domain | Classification |
|---|---|
| Customers: search/filter/inspect | **PARTIAL** — list+filter yes, single-record inspect no |
| Customers: suspend/restore/reset access | **REAL** |
| Customers: inspect usage/subscription/activity | **MISSING** as a joined view (data exists, no endpoint) |
| Revenue: plans/subscriptions/payments | **PARTIAL** — viewable only by direct DB access, no admin route |
| Revenue: refunds | **MISSING** |
| Revenue: reconciliation | **PARTIAL** (§2) |
| Revenue: failures | **MISSING** as a surfaced view |
| Product: feature flags | **MISSING** |
| Product: quotas/entitlements | **PARTIAL** — `Plan.entitlements` is an untyped `Json` blob, editable only via direct DB write, no admin UI/route |
| Product: audit limits | **PARTIAL** — same as above |
| Marketing: offers/coupons/campaigns/attribution | **MISSING** entirely |
| Operations: workers/queues/failed jobs/retries | **MISSING** entirely |
| Operations: monitoring/incidents | **PARTIAL** — Watchdog's own customer-facing monitoring is real; there's no *internal* "is our own infrastructure healthy" view |
| Security: failed logins/token reuse/SSRF/rate-limit/webhook abuse/admin actions | **PARTIAL** — the data model (`SecurityEvent`) supports most of this and already captures auth+billing-fraud events (§2); SSRF/rate-limit/webhook-abuse aren't fed into it, and there's no admin route to view any of it regardless |
| Support: customer issues/activity timeline/health | **MISSING** entirely |

---

## 7. Agency Operating Model

The agency workflow (`Prospect` → `Pitch` → conversion → `ClientWorkspace`) is real and substantial — 21 dedicated agency routes, a `Prospect.status` enum that includes a genuine `CONVERTED` terminal state (`DISCOVERED → VALIDATED → AUDITED → QUALIFIED → CONTACTED → CONVERTED → DISMISSED`), campaign-level progress counters (`targetCount`/`processedCount`/`successfulCount`/`qualifiedCount`), and a real AI/template pitch-generation system (`Pitch.generationType`: `DETERMINISTIC_TEMPLATE` or `REAL_AI`, with token/cost tracking fields already present).

**What agency operators still manage manually, confirmed by the schema/route audit**:

- **Per-client recurring revenue**: impossible to see inside the product — `Subscription`/`Payment` have no `clientWorkspaceId`, so an agency's "how much is Client X worth to me" question has no answer in LeadGuard at all (their downstream client billing presumably happens entirely outside the platform).
- **Client health/churn risk**: `ClientWorkspace.status` is a flat `ACTIVE`/`ARCHIVED`/`ONBOARDING` string — no activity-derived health signal, no "this client hasn't had a monitoring alert acknowledged in 30 days" type of insight.
- **Client communication history**: `ClientWorkspace.notes` is a single freeform text field — no threaded communication log, no "last contacted" timestamp.
- **Conversion pipeline visibility**: the underlying `Prospect.status` transitions are real and queryable, but there's no funnel-conversion-rate view (X% of QUALIFIED prospects become CONVERTED) — the raw counters exist on `ProspectCampaign`, the rate calculation doesn't.
- **Widget lead attribution to revenue**: `Widget` exists and generates leads (confirmed via routes), but there's no traced link from "a widget lead came in" to "that lead became a paying client."

**Assessment**: this is LeadGuard's strongest existing moat (confirmed independently in the earlier Competitive R&D phase — no competitor combines detection + agency prospecting + billing), and the gaps here are exactly the kind of *thin, high-leverage* additions Rule 12 asks about — a client health rollup and a conversion-funnel view are read-only aggregations over data that already exists, not new collection.

---

## 8. Operations Control Plane

Confirmed via direct search: **zero dead-letter-queue handling anywhere in `apps/worker`**, **zero queue/worker/job admin routes**. The 8 BullMQ queues (audit, monitoring, vault, prospect, competitor, pitch, report/PDF, webhook) run with retry/backoff (per the queue definitions already verified in this engagement's earlier phases) but are entirely invisible to an operator — a stuck job is discovered only when a customer complains.

What can be exposed safely without leaking tenant data: **Bull Board** (see §16) operates at the queue/job level, which is inherently cross-tenant-shaped (a job's `data` payload contains an `organizationId`/`auditId`, not raw customer content) — the payload itself would need light redaction (never show a raw webhook secret or API key if one ever ends up in job data, which a quick audit of the existing queue `.add()` call sites should confirm doesn't happen before exposing this) but the queue-depth/failed-count/retry-count level of visibility Rule 13 asks for carries no tenant-data risk by construction.

---

## 9. Security Control Plane

Corrected picture per §2: `SecurityEvent` already covers 13 real event types across authentication and billing-fraud detection — this is **not** the "one event type" gap the prior blueprint described. What's still genuinely missing:

- SSRF blocks: the newly-built `SsrfSafeProxy` (Detection Intelligence P1 phase) tracks `blockedHosts` in-memory and logs them to stdout, but **never writes to `SecurityEvent`** — a real, freshly-identified gap this phase's own prior work created and didn't close (out of scope at the time, in scope now).
- Rate-limit abuse: no evidence found of any rate-limit-triggered `SecurityEvent` write.
- Webhook delivery abuse: `WebhookDelivery` tracks failure/retry state per-delivery, but doesn't feed `SecurityEvent` for patterns (e.g., an endpoint failing repeatedly, or receiving unusually high delivery volume).
- Admin actions / permission changes: covered by `AdminAuditLog` in principle, but that table is functionally unused outside blog CRUD (§2, §6).
- **No admin route exists to view `SecurityEvent` at all**, regardless of how many types feed it — this is arguably the more urgent half of the gap: the data exists and is unused, not absent.

**Is an append-only audit trail already sufficient?** The *shape* is right (`SecurityEvent`: type + userId + ipAddress + metadata Json, indexed by type and by user — exactly append-only, exactly what's needed). The smallest missing capability is not a new table — it's (a) a `GET /admin/security-events` route with filtering, and (b) wiring the 2-3 additional event sources (SSRF, rate-limit, webhook abuse) that don't feed it yet.

---

## 10. Customer Health

No health-score code exists today (confirmed by search — the two "health"/"churn" grep hits were false positives on unrelated terms). Per Rule 10's explicit instruction, this section defines signals, weighting rationale, missing-data handling, refresh mechanism, and explainability **before** proposing a formula — informed by the researched patterns (§16): Gainsight's DEAR taxonomy (Deployment, Engagement, Adoption, ROI) and its Notion case study's sparse-data lesson ("collapse to fewer signals for thin-data accounts rather than force the full model"), and HubSpot's point-based, band-mapped, trend-visible approach.

### Signal categories (mapped to data LeadGuard actually has today)

| Category | Signal | Data source | Currently available? |
|---|---|---|---|
| Deployment/Adoption | Active websites under management | `Website` count | Yes |
| Deployment/Adoption | Monitoring configs active | `MonitoringConfig.enabled` count | Yes |
| Engagement | Audit frequency (last 30/90 days) | `Audit.createdAt` | Yes |
| Engagement | Report views | Would need a `REPORT_VIEWED` event — see §11 | **Not yet — requires event extension** |
| Product value | Unresolved critical/high findings | `AuditFinding`/`MonitoringFinding` open count | Yes |
| Product value | Finding resolution rate over time | `FindingChangeType.RESOLVED` occurrences | Yes (Watchdog regression engine already tracks this) |
| Billing health | Payment success rate | `Payment.status` history | Yes |
| Billing health | Days until renewal / past-due state | `Subscription.currentPeriodEnd`/`status` | Yes |
| Support | Open support issues | No support-ticket model exists | **Not available — would require a new, small domain** |
| Agency-specific | Client workspace activity | `ClientWorkspace` + child audit/monitoring activity | Yes (composable) |

### Design decisions

- **Weighting rationale**: start with a small (4-6 signal) model using only what's verified available today (deployment, engagement, product-value, billing-health) — explicitly deferring "support" as a signal until a support-ticket domain exists, rather than inventing a proxy for it. This directly follows the Notion case-study pattern of collapsing to fewer signals when full data isn't there, rather than forcing five categories with two of them fabricated.
- **Missing-data handling**: an organization with no monitoring configured shouldn't be penalized as if monitoring were unhealthy — each signal must have an explicit "not applicable" state distinct from "unhealthy," never silently defaulted to zero.
- **Refresh mechanism**: computed on read (a query-time aggregation over existing tables) for the initial version, not a scheduled batch job — the underlying data changes slowly enough (audits run daily-to-weekly per org, not per-second) that there's no correctness reason to pre-compute, and computing on read avoids an entire class of staleness bugs a batch job would introduce.
- **Explainability, following HubSpot's pattern**: the score must always be shown with its per-signal breakdown, not just a number — "why is this customer healthy or at risk" means showing which of the 4-6 signals is red, not just a composite 62/100. This is the one HubSpot leaves partially opaque (breakdown requires a separate tab); LeadGuard's version should show it inline given the small signal count makes that cheap.
- **Bands, not a fake-precision number**: 0-100 numeric score is defensible given HubSpot's own precedent, but should always render with a band label (Healthy / Needs Attention / At Risk) alongside the number, matching HubSpot's `>80`/`50-79`/`<50` pattern adapted to LeadGuard's own thresholds once real data exists to calibrate them — **do not hardcode threshold numbers before seeing real distribution data from the first cohort of scored accounts.**

---

## 11. Revenue Intelligence

Per Rule 7, for each metric: source of truth, calculation, owner, update frequency, current data support.

| Metric | Source of truth | Calculation | Update frequency | Data support today |
|---|---|---|---|---|
| MRR | `Subscription` (status=ACTIVE) × `Plan.priceInPaise` | Sum, normalized to monthly per `Plan.billingInterval` | On-read | **Yes, fully computable, not computed** |
| ARR | Derived from MRR | MRR × 12 | On-read | Same |
| New MRR | `Subscription.createdAt` in period | Sum of new subscriptions' plan price in period | On-read, needs a period boundary query | **Yes, computable from existing timestamps** |
| Expansion MRR | `Payment.purpose = PLAN_UPGRADE` | Needs a plan-to-plan delta, not just payment amount | On-read | **PARTIAL** — the event category exists, the before/after plan comparison doesn't |
| Contraction MRR | No existing signal | Would need a downgrade event | — | **NO** — smallest gap: no downgrade path is currently modeled at all (only `PLAN_UPGRADE` exists as a purpose) |
| Churned MRR | `Subscription.status IN (CANCELLED, EXPIRED)`, `canceledAt` | Sum of canceled subscriptions' plan price | On-read | **Yes, computable** |
| Refunds | Would need the `Refund` model from §5 | Sum by period | On-read | **NO — blocked on the missing structured refund data** |
| Audits per account | `Audit` count | Count by org/period | On-read | Yes |
| Monitored websites | `MonitoringConfig.enabled` count | Count | On-read | Yes |
| Findings / resolved findings | `AuditFinding`/`MonitoringFinding` + `FindingChangeType` | Count by state | On-read | Yes |
| Prospect → client conversion rate | `Prospect.status` transitions | `CONVERTED` / total in campaign | On-read | Yes (§7) |
| Revenue-risk detected / resolved | `business-impact.ts`'s `estimatedOpportunityLoss` over time | Delta between audit runs | On-read | **Yes for a single audit; no time-series storage of the trend yet** — see §12 |

**Ownership**: every metric above is a **read-time aggregation over existing tables** — none requires new data collection except Expansion/Contraction MRR (needs a plan-change-delta event) and Refunds (needs the `Refund` model). This is the central finding of this section: LeadGuard's revenue-intelligence gap is a **missing calculation layer**, not a missing data-collection layer, for roughly 10 of the 12 metrics above.

---

## 12. Business-Impact-to-ROI Model

LeadGuard already has a genuinely rare capability (verified extensively in this engagement's Competitive R&D phase): `business-impact.ts`'s `buildBusinessImpact()` computes a transparent, confidence-rated, methodology-disclosed ₹ opportunity-loss estimate per audit. What it does **not** yet do is track that number **over time** to show whether it's improving.

Per Rule 11's explicit semantic requirement — never call a modeled number "actual recovered revenue" — the chain should use precise, distinct terms at each stage:

| Stage | Semantic | Data source |
|---|---|---|
| Baseline | **Estimated risk** — the opportunity-loss figure at first audit | `business-impact.ts` output, `Audit.businessImpact` |
| Issue introduced | **Estimated risk increase** — a new finding raises the modeled risk | Delta between consecutive `AuditScore`/`businessImpact` snapshots |
| Detection | (unchanged — this is what already happens) | `AuditFinding`/`MonitoringFinding` |
| Remediation | **Estimated opportunity** — the ₹ figure recoverable *if* the finding is fixed | Already computed per-finding via `scoreImpact`; not yet expressed in ₹ per-finding, only in aggregate |
| Monitoring confirms fix | **Observed improvement** — the finding's `FindingChangeType` transitions to `RESOLVED`, and the *modeled* risk figure drops in the next `businessImpact` calculation | `MonitoringFinding.changeType`, next audit's `business-impact.ts` output |
| Verified outcome | **Only if there is direct evidence** (e.g., a tracking pixel confirmed `FIRED` after being `NOT_FIRING`, from the Detection Intelligence P1 work) — this is the *one* case where LeadGuard can say something concrete actually changed, not just "the model's risk estimate went down" | `TrackingRuntimeEvaluation` before/after comparison |

**What this requires that doesn't exist today**: a time series of `businessImpact` values per organization/website (currently each audit's `businessImpact` is stored per-`Audit`, so the series technically already exists — it's just never queried as a trend). **No new data model is needed** — this is a read-time aggregation (`SELECT businessImpact FROM Audit WHERE websiteId = ? ORDER BY createdAt`) plus a small amount of trend-rendering logic, exactly the same "missing calculation layer, not missing data" pattern as §11.

**Guardrail, restated plainly for implementation**: never label this "actual recovered revenue" or "money saved" anywhere in the UI or a customer-facing report — every existing precedent in this codebase (the `buildBusinessImpact` methodology string itself) already uses hedged language ("potential opportunity loss... provides a model for prioritization rather than an accounting audit"); the trend view must inherit that same discipline, not regress from it.

---

## 13. Source-of-Truth Matrix

| Business Fact | Current Source | Canonical? | Reliable? | Missing? |
|---|---|---|---|---|
| MRR | None (not computed) | No | N/A | Calculation layer |
| Subscription status | `Subscription.status` | Yes | Yes | Nothing |
| Payment status | `Payment.status` | Yes | Yes | Nothing |
| Refund | `Payment.status` enum value only | No (no amount/reason) | Partial | Structured `Refund` model |
| Audit usage | `UsageRecord` (4 metrics) | Yes, for those 4 | Yes | Broader metric coverage (reports generated, findings resolved) |
| Monitoring usage | `MonitoringRun` | Yes | Yes (now that the scheduler is confirmed running) | Nothing structural |
| Customer health | Not computed | No | N/A | Entire calculation layer (§10) |
| Campaign attribution (agency) | `Prospect.source`/`ProspectCampaign.source` | Yes, for agency funnel | Yes | Direct-signup acquisition source has no equivalent field |
| Coupon redemption | N/A | N/A | N/A | Entire commerce domain (§5) |
| Prospect conversion | `Prospect.status = CONVERTED` | Yes | Yes | A conversion-rate rollup view (raw signal is fine) |
| Revenue-impact reduction | `Audit.businessImpact` (per-audit snapshot) | Yes, per-snapshot | Yes | Trend query across snapshots (§12) |
| Admin actions | `AdminAuditLog` | Yes in principle | **No — functionally empty outside blog CRUD** | Wiring, not schema |
| Security events | `SecurityEvent` | Yes, for 13 covered types | Yes for those | SSRF/rate-limit/webhook-abuse coverage + an admin viewer |
| Core product lifecycle events (signup, audit started/completed, subscription started) | **No canonical source** | No | N/A | `FunnelEvent` extension (§14) |

---

## 14. Event/Ledger Assessment

**Decision: (A) — extend the existing `FunnelEvent` table; do not build a new event-ledger layer.**

Evidence for this decision: `FunnelEvent` (`organizationId`, `websiteId?`, `auditId?`, `leadId?`, `type: String`, `data: Json?`, `sessionId?`, `createdAt`, indexed on `(organizationId, type, createdAt)` and `(auditId, createdAt)`) is *already* exactly the shape Rule 8 describes — generic, append-only, arbitrarily typed. It's proven in production today for one funnel (`FunnelEventService`, called from the guest Express-Fix checkout path — `FREE_SCAN_STARTED` through `FULFILLMENT_CREATED`, 8 types). The gap is not architectural, it's coverage: none of the authenticated-org-lifecycle events Rule 8 lists (`SIGNUP`, `AUDIT_STARTED`/`AUDIT_COMPLETED` for real org audits — not just guest scans, `SUBSCRIPTION_STARTED/RENEWED/CANCELLED`, `PROSPECT_CREATED`/`PITCH_SENT`/`PROSPECT_CONVERTED`, `MONITORING_STARTED`, `FINDING_OPENED`/`FINDING_RESOLVED`) currently get recorded through it, even though every one of the underlying state changes already happens somewhere in the codebase (they'd just need one `funnelEventService.record()` call added at each existing call site).

**A separate `BillingEvent` table also already exists** and is the right home for billing/webhook-specific events (it has provider/providerEventId dedup built in) — no change needed there, it's already doing its narrower job correctly.

Rejected alternative: a dedicated new domain-event/event-bus layer (Kafka/NATS-style). Explicitly not justified — this would duplicate `FunnelEvent`'s job at real infrastructure cost, for a company whose actual gap is "the existing generic table isn't called from enough places," not "the existing generic table's architecture is wrong."

---

## 15. Architecture Assessment

Re-affirming the blueprint's own conclusion (§05/§14) with no change: **incremental evolution, not a restructure.** Specifically for this phase's scope:

- `apps/admin` extraction: **not justified yet**, same reasoning as the blueprint (§4 there) — extracting the shell before real internal RBAC exists just relocates the same single-privilege-bit risk to a new address. Nothing in this phase's findings changes that calculus.
- `packages/contracts`: **not justified yet** — still a one-consumer package until a second frontend exists.
- A dedicated `security/` or `billing/` backend module: the blueprint already correctly flags `billing/` as "Now, extend in place" — this phase's findings (Refund model, admin routes) fit inside that existing extension path, not a new one.
- New domain packages: **none justified** — every capability this document recommends (§19-22) is additive to existing domains (billing, agency, monitoring) or a new, small, self-contained one (a coupon domain, when built) — none requires a new deployable or a new package boundary.

---

## 16. Competitor Patterns (external research, cited)

**Customer 360 layout** (Stripe, Chargebee, Intercom, Zendesk — full detail with citations gathered this phase): converge on the same shape — an identity/plan summary card above the fold, transactional state (subscriptions/invoices/payments) as a peer panel not a drill-down, and activity/interaction history present but collapsed into an expandable log rather than shown inline in full. Zendesk's four-panel model (Profile / Interactions / Pages Viewed / Device) is the most directly adaptable to LeadGuard's own support-context need once one exists.

**Customer health scores** (Gainsight, HubSpot, ChurnZero): Gainsight's Notion case study is the single most directly applicable finding — collapse to fewer signal categories for thin-data accounts rather than force a full five-dimension model with fabricated inputs, which is exactly what §10 recommends for LeadGuard's first version. HubSpot's point-banded score with a visible trend graph (even without a live per-criterion breakdown) is a reasonable, achievable initial bar.

**Revenue metrics** (Stripe, Chargebee, Paddle): all three converge on the same four-bucket MRR-movement model (New / Expansion / Contraction / Churn) — this is now the recommended vocabulary for LeadGuard's own revenue-intelligence layer (§11), not an invented taxonomy.

**Coupon/discount engines** (Stripe, Chargebee, Paddle): Stripe's two-tier Coupon+PromotionCode model is the fullest-featured; Paddle's flatter single-object model is the more appropriate **starting point** for LeadGuard given the confirmed absence of any existing commerce infrastructure — start flat (one discount table: type, value, expiry, max_redemptions, plan scope), add the promo-code indirection layer only once a real need for per-customer-eligibility or first-order-only rules is identified.

**Admin control planes**: Stripe's own three-tier internal role model (Administrator / Developer / Support Specialist — explicitly separating view access from action capability, and gating financial aggregates behind the highest tier) is the direct template for LeadGuard's internal-RBAC design once it's built (already flagged as G-05 in the blueprint; this phase adds the concrete role-shape reference). Retool-pattern "internal tool as first-class product" is validated as the general approach, but LeadGuard's own existing React admin surface inside `apps/web` is a perfectly adequate substrate for this — no case for adopting Retool itself.

**Entitlements**: Stripe's Entitlements API (Feature objects with a `lookup_key`, computed active-entitlement-per-customer, webhook-pushed) and LaunchDarkly's segment-targeting approach both converge on the same underlying principle — decouple "what plan" from "what can this org do" via a keyed lookup, cached/synced rather than queried live on every request. LeadGuard's `Plan.entitlements: Json` blob is structurally the right idea already; it just needs a typed schema (matches blueprint G-11) rather than a new access-control layer.

**Queue visibility**: **Bull Board** (`felixmosh/bull-board`) is the direct, low-effort answer to Rule 13/G-09 — a drop-in Express router over the existing BullMQ queues, showing per-state job counts, individual job inspection, and repeatable-job schedules, with retry/remove/promote actions built in. This is the single cheapest, highest-leverage item in this entire document to actually implement.

---

## 17. Product Gaps (consolidated, not duplicating the blueprint's G-01 through G-19)

New gaps this phase identifies that the blueprint didn't (or that supersede a now-stale blueprint item):

| ID | Gap | Severity |
|---|---|---|
| RI-01 | No revenue-intelligence calculation layer (MRR/ARR/churn) despite fully-sufficient underlying data | **P0** |
| RI-02 | No structured `Refund` model — refund amount/reason untracked | **P0** |
| RI-03 | No single-organization admin detail endpoint — Customer 360 is un-buildable without it | **P1** |
| RI-04 | `FunnelEvent` wired to guest checkout only, not core org lifecycle | **P1** |
| RI-05 | `AdminAuditLog` functionally unused outside blog CRUD — sensitive admin actions leave no trace | **P1** |
| RI-06 | `SecurityEvent` has no admin viewer despite 13 real event types already flowing into it | **P1** |
| RI-07 | SsrfSafeProxy's blocked-host tracking doesn't feed `SecurityEvent` (gap this engagement's own prior phase created) | **P2** |
| RI-08 | No client-level (agency) revenue visibility — `Subscription`/`Payment` lack `clientWorkspaceId` | **P2** |
| RI-09 | Zero queue/worker observability — Bull Board not installed | **P1** |
| RI-10 | No customer health model of any kind | **P2** |
| RI-11 | Business-impact trend (§12) not queried despite the underlying time-series data already existing per-audit | **P2** |

---

## 18. Highest-Value Opportunities

Ranked by leverage (value delivered ÷ implementation cost), not just importance:

1. **Bull Board queue visibility** — highest leverage in the entire document: a few hours of wiring against infrastructure that already exists, closes a real "customers complain before we know" gap.
2. **MRR/ARR/churn calculation layer** — pure read-time aggregation over existing tables (§11); the single highest business-value item, and it requires zero new data collection.
3. **`GET /admin/organizations/:id` join endpoint** — unlocks Customer 360 without a new frontend app; every field it needs already exists.
4. **Extend `FunnelEventService` calls to the core org lifecycle** — small, proven-pattern, unlocks New/Churned MRR by period and the customer-health engagement signal simultaneously.
5. **`Refund` model + admin refund-issuance route with approval/audit-log requirements** — closes both a revenue-visibility gap (§4) and an operational gap (refunds currently happen invisibly, outside the product).

---

## 19. Recommended Information Architecture

**Customer 360 — the smallest useful version**, informed by §16's research but adapted to LeadGuard's actual current data (not copying any vendor's full UI):

- **Header card** (always visible): org name, plan, subscription status badge, health-score band (once §10 exists), suspend/restore action.
- **Panel 1 — Revenue**: current plan, MRR contribution, payment history (last N), invoices, refund history (once it exists) — peer-level, not drill-down, matching the Stripe/Chargebee pattern.
- **Panel 2 — Product usage**: websites count, audits (recent + trend), monitoring configs active, findings open/resolved trend.
- **Panel 3 — Activity timeline**: composed from `FunnelEvent` (once extended) + `AdminAuditLog` (once populated) — a single chronological feed, collapsible, matching Zendesk's "Interactions" panel pattern.
- **Panel 4 — Security** (admin-only visibility tier): `SecurityEvent` rows for this org's users.
- **Panel 5 — Agency-specific** (only rendered when the org has `ClientWorkspace` rows): client count, per-client activity summary.

This is five panels, not a giant page — deliberately smaller than any single researched competitor's own view, because LeadGuard's data surface (no support tickets yet, no NPS, no seat-based product) is smaller too. Do not pre-build panels for data that doesn't exist yet (support, NPS) — add them when the underlying domain is built, per Rule 20.

---

## 20. Recommended Data Model Changes

Minimal, additive, no destructive migration:

- **`Refund`** — `id, paymentId, amountInPaise, reason, status, requestedByUserId, approvedByUserId?, providerRefundId?, createdAt`. References existing `Payment`, doesn't touch it.
- **Extend `FunnelEvent` usage** (no schema change — the table is already generic) with a defined, documented event-type vocabulary matching Rule 8's list, added incrementally at each real state-change call site.
- **Typed `Plan.entitlements`** (blueprint G-11, re-affirmed) — a Zod-validated shape instead of untyped `Json`, matching `packages/config`'s existing "fail at boot, not silently" convention already used elsewhere in this codebase.
- **`Coupon`/`Discount`** (when commerce work is actually authorized — not this phase) — start with Paddle's flatter model (§16): type, value, expiry, max_redemptions, plan-scope array. Add promo-code indirection only if/when a real need for it appears.
- **Nothing else.** No new `CustomerHealthSnapshot`/materialized table is recommended for the first version — §10 explicitly designs the health score as computed-on-read.

---

## 21. Recommended API Changes

- `GET /admin/organizations/:id` — the single highest-leverage new endpoint in this document; joins Website/Subscription/Payment/Audit-summary/SecurityEvent counts for one org.
- `GET /admin/revenue/summary` — MRR/ARR/New/Churned, computed per §11.
- `GET /admin/security-events` — filtered list, closing RI-06.
- `POST /admin/refunds`, `GET /admin/refunds` — gated by the approval/audit requirements in §23.
- `GET /admin/queues` (or mount Bull Board directly at an admin-gated path, per §16) — closes RI-09.
- No changes to any customer-facing (`apps/web`, non-admin) route are required for this phase's recommendations.

---

## 22. Recommended Frontend Surfaces

- Extend the existing admin views inside `apps/web` (not a new app — §15) with: the Customer 360 panel set (§19), a revenue-summary view, a security-events table, a Bull Board mount (or an embedded equivalent view).
- No agency-facing frontend changes are strictly required for this phase's P0/P1 items — the client-health/conversion-rate views from §7 are P2, agency-side additions.

---

## 23. Permission/Security Model

For every new control this document proposes, per Rule 15's explicit template:

| Control | Permission | Validation | Approval required | Re-auth | Audit event | Rollback | Effective time |
|---|---|---|---|---|---|---|---|
| Issue refund | New `REFUND_ISSUE` capability (RBAC-gated, not just `platformAdmin`) | Amount ≤ original payment amount; payment must be CAPTURED | Yes — a second admin or explicit self-attestation, given this moves money | Recommended (re-enter password) given the blast radius | `AdminAuditLog` entry, mandatory | Cannot roll back a real Razorpay refund — only a local record correction | Immediate |
| View Customer 360 / SecurityEvent | Existing `platformAdmin` (read-only) | N/A | No | No | Read access itself should be logged for a customer-data-sensitive view | N/A | Immediate |
| Suspend/restore org | Already exists, already audit-logged | Already implemented | Current behavior retained | No | Already logged | Restore is the rollback | Immediate |
| Create/disable a coupon (future, not this phase) | New `COMMERCE_MANAGE` capability | Expiry/redemption-limit bounds | No for creation, yes for any coupon affecting >N existing customers | No | `AdminAuditLog`, mandatory | Disable is the rollback (never hard-delete an already-redeemed coupon) | Can be scheduled (start/end dates) |
| Cancel/retry a stuck job (Bull Board) | New `OPERATIONS_MANAGE` capability, distinct from `platformAdmin` | N/A | No | No | Should be logged even though Bull Board doesn't do this natively — wrap it | Retry is naturally idempotent; cancel is not reversible | Immediate |

**This table itself is evidence for why internal RBAC (blueprint G-05) is a prerequisite, not a nice-to-have**, once any of §21's write-capable routes are built — every row above assumes a capability finer-grained than the current single `platformAdmin` boolean.

---

## 24. Implementation Priority

| Capability | Customer Value | Revenue Value | Retention | Operational Value | Moat | Complexity | Priority |
|---|---:|---:|---:|---:|---:|---:|---:|
| MRR/ARR/churn calculation layer | Low (internal) | **High** | Medium | High | Low | **Low** | **P0** |
| `Refund` model + issuance flow | Low (internal) | **High** | Medium | High | Low | Medium | **P0** |
| `GET /admin/organizations/:id` | Low (internal) | Medium | Low | **High** | Low | **Low** | **P0** |
| Bull Board queue visibility | Low (internal) | Low | Low | **High** | Low | **Low** | **P0** |
| Fix password-reset email (confirmed still broken, §2a) | **High** (customer-facing) | Medium (churn from lockout) | **High** | High | Low | Low | **P0** |
| Extend `FunnelEvent` to core lifecycle | Low (internal) | High | Medium | High | Low | Low | **P1** |
| Admin `SecurityEvent` viewer + SSRF/rate-limit wiring | Low (internal) | Low | Low | Medium | Low | Low-Medium | **P1** |
| Customer health score (v1, computed-on-read) | Medium | Medium | **High** | Medium | Medium | Medium | **P1** |
| Business-impact trend view | **High** (customer-facing, proves value) | Medium | **High** | Low | **High** | Low | **P1** |
| Agency client-health/conversion-rate view | Medium (agency-facing) | Medium | High (agency retention) | Low | Medium | Low-Medium | **P1** |
| Internal RBAC (multi-role, not just `platformAdmin`) | Low | Low | Low | High | Low | Medium | **P1** (prerequisite for §23's write actions) |
| Coupon/discount engine (flat v1) | Medium | Medium | Low | Low | Low | Medium | **P2** |
| Typed `Plan.entitlements` | Low | Low | Low | Medium | Low | Low-Medium | **P2** |
| `apps/admin` extraction | Low | Low | Low | Medium | Low | High | **P3** |
| Full agency per-client billing | Low (niche) | Low (unclear demand) | Low | Low | Low | High | **DROP for now** — no evidence agencies want LeadGuard to bill *their* clients rather than doing so themselves |

---

## 25. Things NOT to Build

Explicitly rejected, per Rule 20 and re-affirming the blueprint's own §14:

- Vanity analytics dashboards with no decision attached to any number shown.
- A full CRM (the agency `Prospect`/`Pitch` system already covers what LeadGuard actually needs; do not add contact-management/deal-pipeline features beyond what the agency workflow uses).
- A full ERP or accounting system — `Invoice`/`Payment` cover what's needed; do not build general ledger/multi-currency-consolidation/chart-of-accounts machinery.
- A full helpdesk clone — if a support-ticket domain is ever built, keep it to the minimum (ticket, status, linked org) needed to feed the Customer 360 activity panel, not a Zendesk competitor.
- A full BI platform / data warehouse — every metric in §11 is answerable via read-time Postgres aggregation at LeadGuard's current and near-future scale; revisit only per the blueprint's own §08 scale triggers.
- A dedicated event-bus (Kafka/NATS) — §14's decision is explicit: extend `FunnelEvent`, don't replace the pattern.
- Microservices for any of the above — everything recommended here is additive to the existing modular monolith.
- A third-party feature-flag vendor or entitlements platform — Stripe's own Entitlements API pattern (§16) is worth copying conceptually (typed feature lookup, cached), not worth paying for at this scale.
- `apps/admin` extraction before internal RBAC exists (already the blueprint's position, re-affirmed).
- Per-client billing/invoicing for agencies (§24) — no evidence of demand, meaningfully increases commerce-engine complexity for an unvalidated need.

---

## 26. Risks

- **Building the health score or a coupon UI before the calculation/data layer (§11, §5) is real** produces a dashboard that shows plausible-looking numbers nobody can verify — actively worse than no dashboard, because it creates false confidence. Sequencing matters more than usual here.
- **Refund issuance without the approval/audit safeguards in §23** turns a currently-invisible-but-at-least-external (Razorpay dashboard) process into an invisible *and* internal one — building the feature without the safeguard is a regression, not an improvement.
- **Continuing to grow the admin surface before internal RBAC exists** (already the blueprint's top risk, re-affirmed) — every new admin route this document recommends (§21) widens the blast radius of the single `platformAdmin` boolean until RI-01/RI-09's prerequisite (internal RBAC, already P1 in the blueprint) is actually built.
- **The password-reset gap (§2a) is a live, user-facing P0 independent of everything else in this document** — it should not wait for any of the revenue-intelligence work; it's a correctness bug, not a strategic feature.

---

## 27. Final CEO Recommendation

Do not build a Customer 360 page, a health score UI, or a coupon system first. Build the four things that make all of them possible and honest: the MRR/ARR calculation layer, the `Refund` model, the single-organization admin join endpoint, and Bull Board — all four are low-complexity, additive, and turn "we'd need a database query to know that" into "the product already knows that." Everything else in this document (health scores, coupon UI, agency client-health views) is a thin, low-risk layer on top of that foundation, and building it first — over data the product itself can't yet verify — would produce exactly the "guess → finding → fake certainty" anti-pattern this whole engagement has been careful to avoid in the detection engine. Apply the same discipline to the business side of the house.

---

## REVENUE INTELLIGENCE R&D RESULT

### Current Product Maturity
**7/10** — the customer-facing detection/audit/agency product is genuinely mature (three prior engagement phases independently verified this); this score is pulled down only by the internal operating layer this document audits, not by the product itself.

### Customer 360 Maturity
**3/10** — every underlying data relationship is real and correctly org-scoped; there is no join endpoint or view that assembles them, and two domains (refunds, support) aren't first-class records yet.

### Revenue/Finance Maturity
**4/10** — the ledger (Payment/Invoice/Subscription/Plan) is real and structurally sound; the intelligence layer on top (MRR/ARR/churn/refund tracking) is entirely absent despite being computable today from existing data for roughly 10 of 12 core metrics.

### Commerce Maturity
**0/10** — confirmed, full-codebase-verified absence of coupons/discounts/campaigns/trials/referrals/credits. Not partially built; not built at all.

### Admin Control Plane Maturity
**3/10** — 17 routes total, real for user/org suspend and blog CRUD, missing for revenue, security, operations, and commerce entirely; the audit-log table is populated for exactly one action category.

### Agency Operating System Maturity
**6/10** — the strongest internal domain outside the detection engine itself; real prospect→pitch→conversion tracking, real campaign lifecycle, missing only client-level revenue visibility and a health/conversion rollup.

### Operations Maturity
**2/10** — 8 real, working BullMQ queues with retry/backoff, zero visibility into any of them, zero dead-letter handling, confirmed by direct search.

### Security Operations Maturity
**5/10** — materially better than previously documented (13 real event types, not 1), but the data is invisible to any admin, and infrastructure-level events (SSRF, rate-limit, webhook abuse) don't feed it yet.

### Biggest Product Gap
No revenue-intelligence calculation layer — the company cannot state its own MRR, despite every input needed to compute it already existing in the database.

### Biggest Commercial Opportunity
Turning the already-real `business-impact.ts` engine into a **trend** (§12) — LeadGuard is the only tool in its competitive set (per the earlier Competitive R&D phase) with a transparent ₹ business-impact model at all; showing that number improving over time, with honest "estimated" language, is a retention and expansion lever no competitor can currently copy.

### Biggest Architectural Risk
Growing the admin surface (refunds, security views, revenue dashboards — all recommended in this very document) before internal RBAC exists, each addition further widening a single unscoped `platformAdmin` boolean's blast radius.

### Most Valuable P0
The MRR/ARR/churn calculation layer — highest revenue value, lowest complexity, zero new data collection required, and every day it doesn't exist is a day the company operates without knowing its own top-line number.

### Most Valuable P1
Extending `FunnelEventService` calls to the core organization lifecycle — small, proven-pattern, and unlocks New/Churned MRR-by-period, the health-score engagement signal, and the Customer 360 activity panel simultaneously from one change.

### Strongest Potential Moat
The business-impact-to-ROI trend (§12) — connects LeadGuard's unique detection-and-quantification capability directly to a retention narrative ("your risk went down after you fixed what we found") that no competitor identified in the earlier R&D phase can currently make, because none of them combine detection with a transparent revenue model at all.

### What LeadGuard Must NOT Become
A CRM, an ERP, a helpdesk, or a BI platform (§25) — it needs to own enough information to run itself and prove customer/website value, not replicate every category of SaaS tooling that exists.

### Recommended Next Implementation Phase
A focused "revenue foundation" phase — implement the four §27 P0 items (MRR/ARR/churn calculation, `Refund` model, `GET /admin/organizations/:id`, Bull Board) plus the confirmed-still-broken password-reset email fix (§2a) — all five are additive, low-risk, and individually small, sequenced before any dashboard/UI work that would depend on them.

### Production Readiness
**NOT READY** — not because tests fail (this phase touched no application code), but because the business itself cannot currently state its own revenue, has no structured refund record for money that has already left the business via an unaudited external path, and has an admin surface with a single undifferentiated privilege bit. Readiness here is a business-operations judgment, not a test-suite result, per this phase's own explicit instruction not to conflate the two.

---

## 28. Revenue Foundation Implementation Outcome

**Date:** 2026-09-03/04. The "Revenue Foundation" phase implemented all five §27 recommendations. Full detail — exact semantics, code locations, tests — is in `docs/REVENUE_FOUNDATION_IMPLEMENTATION.md`. This section closes the loop on every finding this document raised, so nothing here is left as a stale open gap.

| §24/§27 finding | Outcome | Where |
|---|---|---|
| MRR/ARR/New/Churned MRR calculation layer | **RESOLVED** | `revenueIntelligenceService.ts`, `GET /admin/revenue/summary` (gated `FINANCE_VIEW`) |
| `Refund` model + issuance flow | **RESOLVED** | `Refund` model + `RefundService`, `POST/GET /admin/refunds` (gated `REFUND_ISSUE`/`FINANCE_VIEW`) |
| `GET /admin/organizations/:id` (Customer 360 source endpoint) | **RESOLVED** | `adminCustomer360Service.ts` (gated `CUSTOMER_360_VIEW`) |
| Bull Board queue visibility | **RESOLVED** | `admin/queueBoard.ts` (gated `OPERATIONS_VIEW`/`OPERATIONS_MANAGE`), sanitized + audited |
| Password-reset email (§2a P0) | **RESOLVED** | `authSecurityService.ts` now sends real mail via the shared `SmtpEmailProvider` |
| Email verification already-verified bug (found during this phase, not in the original R&D) | **RESOLVED** | Same file — see implementation doc §12 |
| Internal RBAC (§23 prerequisite) | **RESOLVED, minimally** | `platformCapabilities` + `requirePlatformCapability` — a fixed six-capability list, not a full role system, per this document's own §20 instruction not to over-build |
| Expansion MRR / Contraction MRR (§16) | **DEFERRED, honestly** | Returned as explicit `UNSUPPORTED` objects with documented reasons — not computed, not guessed |
| Customer health score (§9/§24, P1) | **DEFERRED** — out of scope for this phase | Not started |
| Coupon/discount engine (§24, P2) | **DEFERRED** — out of scope for this phase, explicitly excluded | Not started |
| Full Customer 360 UI / health-score UI (§22, P1) | **DEFERRED** — explicitly excluded from this phase | The API/data foundation now exists for a future UI phase to read from |
| `apps/admin` extraction (§24, P3) | **DEFERRED**, correctly — this document's own §25 says not to extract before RBAC exists; RBAC now exists but extraction was still out of scope for this phase | Not started |
| Extending `FunnelEvent` to the core lifecycle (§24, P1) | **NOT DONE** — not in this phase's scope; `FunnelEvent` is read (not written) by the new Customer 360 endpoint | Not started |
| Admin `SecurityEvent` viewer (§24, P1) | **NOT DONE** — `SECURITY_VIEW` capability was added in anticipation but no route uses it yet | Not started |

**Business Correctness verdict**: the business can now state its own current MRR/ARR and per-period New/Churned MRR from a real API, backed by tests proving the exact invariants this document worried about (double-counting, cross-tenant leakage, cumulative refund overrun). Expansion/Contraction MRR remain honestly unanswerable rather than fabricated.

**Production Readiness, updated**: see the final "REVENUE FOUNDATION IMPLEMENTATION RESULT" report for the authoritative verdict — this section is a status index, not a re-judgment.
