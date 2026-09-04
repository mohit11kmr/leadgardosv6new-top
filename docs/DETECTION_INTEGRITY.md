# Detection Integrity

How LeadGuard's audit engine distinguishes what it can prove from what it merely observed, and the exact idempotency/security boundaries around the four systems hardened in the "Detection Integrity + Paid-Promise Correctness" phase (2026-09-02). This document is the technical reference; see `docs/RND_COMPETITIVE_FEATURE_MINING.md` §23 for what changed and why.

## 1. Static vs. runtime tracking evidence

`packages/shared/src/scanners/tracking.ts` (`scanTracking`) detects tracking **code** — a GA4 measurement ID, a `fbq()` call, a GTM container reference — via regex signature matching against a page's HTML. This has always been true and remains unchanged: it proves a tag's *installation code is present*, nothing more.

`packages/shared/src/network-evidence.ts` (`matchTrackingRequest`, `evaluateTrackingRuntime`) adds a second, independent axis: whether a **real outbound network request** matching that provider's known beacon endpoint was actually observed during a live, JS-executed page visit. The two axes combine into four effective states per provider:

| Static | Runtime | Meaning | Finding emitted |
|---|---|---|---|
| absent | n/a | No code found anywhere, static or rendered | `..._MISSING` (unchanged, pre-existing) |
| absent | `FIRED` | No static signature, but a real request fired anyway (e.g. server-side injected, non-standard loader) | none — presence is inferred from the fired request; never reported as missing |
| present | `FIRED` | Code present and confirmed firing | none — healthy state, nothing to report |
| present | `NOT_OBSERVED` | Code present, a real capture window ran, nothing matched | `..._NOT_FIRING` (new) — hedged wording, never says "broken" |
| present | `NOT_VERIFIED` | Code present, but no capture window ran or it failed | none — we don't know, so we don't claim anything |

`NOT_VERIFIED` occurs whenever `ENABLE_JS_RENDERED_RESCAN` is off, the rendered rescan wasn't reached (zero crawled pages), or the headless-browser pass failed (launch error, navigation timeout, SSRF validation rejection). This state is structurally incapable of producing a finding — `evaluateTrackingRuntime` only distinguishes `FIRED` from `NOT_OBSERVED` when `captureAttempted` is `true`.

## 2. Provider-specific runtime signals (and their honest limits)

Implemented in `matchTrackingRequest` (`packages/shared/src/network-evidence.ts`):

- **Meta Pixel** — matches the actual beacon endpoint `facebook.com/tr` (or `/tr/`). The `connect.facebook.net` script load is deliberately *not* treated as "fired" — that only proves the library loaded, not that an event was sent.
- **GA4** — matches the Measurement Protocol collect endpoint `*.google-analytics.com/g/collect` (including the `region1.`-style regional hosts and `analytics.google.com`). The `gtag.js` script load is likewise not treated as firing.
- **GTM** — matches the container script load `googletagmanager.com/gtm.js`. **This is a real, documented limitation**: GTM has no single "an event fired" endpoint of its own — it's a container that loads and manages other tags. Observing the container script load proves the container executes; it does **not** prove that any specific tag configured inside that container actually fired. Verifying an individual GTM-managed tag requires GTM's own Preview/Debug mode — the `GTM_NOT_FIRING` finding's description says so explicitly.

## 3. Network capture boundaries (what is and isn't captured)

Capture happens once per audit, on the single homepage the existing `ENABLE_JS_RENDERED_RESCAN` pass already visits (`apps/worker/src/audit/renderedFetch.ts`) — no new browser pass, no new crawler. `attachNetworkEvidenceCapture(page, pageUrl)` wires a `page.on('request')` listener that:

- Reads only `request.url()`, `.method()`, and `.resourceType()`. **Never** `request.headers()`, `.postData()`, or anything cookie-adjacent — those methods are never called, so that data never enters process memory in the first place (not "captured then redacted"; never captured at all).
- Reduces a matched URL to `hostname + pathname` only — the query string is dropped except for a narrow, explicit allowlist (`extractRelevantQueryParams`): GA4's `tid`/`en`, and (as of the P1 phase) Meta Pixel's `id`/`ev` — see `docs/DETECTION_INTELLIGENCE_P1.md` §3 for why Advanced Matching params are explicitly excluded. GTM has no allowlisted params at all. This is an allowlist, not a blocklist: an unrecognized parameter is never captured by default.
- Caps at 200 entries per audit (`MAX_NETWORK_EVIDENCE_ENTRIES`) to bound memory and payload size.
- Is purely observational: it never calls `page.route()` to block, modify, or redirect any request. Network interception here means *listening*, never *fetching* — LeadGuard's own code never issues a second request to any URL it observes.

## 4. Security / redaction rules

- Reuses the existing `sanitizeFindingEvidence` (`packages/shared/src/evidence.ts`) sensitive-key stripping wherever network evidence flows into a `Finding.evidence` object, consistent with every other scanner in the codebase.
- **UPDATED (P1 phase) — SEC-1 CLOSED**: the SSRF/DNS-rebinding gap this section previously disclosed as unfixed (`renderedFetch.ts`'s browser navigation was not DNS-pinned, and no subresource request was validated at all) has been closed. Both browser-rendering paths (`renderedFetch.ts` and `pdfWorker.ts`'s `renderHtmlToPdf`) now launch Chromium through a local SsrfSafeProxy (`apps/worker/src/net/ssrfSafeProxy.ts`) that pins every request — navigation, every subresource, every redirect hop — to a freshly resolved, classified-safe address. Full technical detail, threat coverage, and test evidence: `docs/DETECTION_INTELLIGENCE_P1.md` §1-2.
- `NetworkEvidenceEntry` is a plain, deterministic, JSON-serializable object (no class instances, no circular references, no raw Playwright objects ever cross the `attachNetworkEvidenceCapture` boundary).

## 5. Audit retry / idempotency semantics

`AuditOrchestrator.execute` (`apps/worker/src/audit/orchestrator.ts`) claims an audit atomically via a compare-and-swap `db.audit.updateMany`. The contract:

| Current status | Claimable? | Case |
|---|---|---|
| `CANCELLED` | Never | Permanently terminal — a user cancellation is never overridden by a retry |
| `RUNNING`, fresh (`startedAt` within `MAX_AUDIT_DURATION_MS` + 30s grace) | No | **Duplicate delivery while genuinely in-flight** — this is the actual protection against two concurrent executions of the same audit |
| `RUNNING`, stale (`startedAt` older than the timeout + grace) | Yes | **Worker-crash recovery** — the previous execution never reached `finalizeAudit` (process killed, not just a handled timeout) and is treated as orphaned |
| `QUEUED`, `FAILED`, `PARTIAL`, `COMPLETED` | Yes | **Retry after failure** and **explicit re-run of a finished audit** are both legitimate — a completed audit is not a permanently-closed record; re-scanning the same website again is a normal, expected operation |

Previously, the guard only excluded `CANCELLED`/`COMPLETED` — this both incorrectly rejected legitimate re-runs of completed audits (the exact failure `tests/retry.test.ts` caught) **and** never actually protected against concurrent duplicate execution of a genuinely-`RUNNING` audit, since `RUNNING` was never in the excluded set. Two un-deduplicated enqueue call sites exist today (`apps/api/src/services/public/guestScanService.ts` and `publicAuditService.ts` add jobs without a deterministic `jobId`, unlike the authenticated route which uses `jobId: audit.id`) — for those paths, this claim guard is the *only* protection against duplicate concurrent execution.

A claim attempt that loses the race (rejected) still has an `AuditRun` row from step 2 of `execute()` — that row is explicitly closed out as `CANCELLED` with an `errorCode` of `CLAIM_REJECTED_<REASON>` rather than left dangling at `RUNNING` forever, so `AuditRun` history never misrepresents a rejected attempt as an in-progress one.

**Known limitation**: there is no periodic sweeper that proactively flips a long-orphaned `RUNNING` audit to `FAILED` if nothing ever retries it — it simply stays reclaimable (and visible as `RUNNING` in any UI reading `Audit.status`) until the next execution attempt for that same `auditId` arrives. Adding an active sweep job was judged out of scope for this phase (new periodic job = new architecture, not a fix to existing logic) and is a candidate follow-up.

## 6. PDF generation and download

**Generation** (`apps/worker/src/report/pdfWorker.ts`, `renderHtmlToPdf`) was already real prior to this phase — a genuine headless-Chromium `page.pdf()` call, not HTML written to disk under a `.pdf` name. This phase's real gap was **downloading** it: `Report.pdfPath`/`pdfStatus` were populated but no route ever served the bytes back.

Two new routes:

- `GET /api/v1/reports/:id/pdf` — authenticated, org-scoped (same `REPORT_VIEW` permission tier as viewing the report). 404 (`REPORT_NOT_FOUND`) if the report doesn't belong to the caller's org; 409 (`PDF_NOT_READY`) if `pdfStatus` isn't `READY`.
- `GET /api/v1/reports/share/:token/pdf` — public, mirrors the existing `GET /reports/share/:token` JSON route's password/expiry/revocation checks via the same `resolveShareLink` path, so the two views can never drift out of sync on authorization logic.

Both stream real bytes with `Content-Type: application/pdf` and a `Content-Disposition: attachment; filename="report_<id>_v<version>.pdf"` header — never HTML content under a `.pdf`-sounding name.

The `StorageProvider`/`LocalStorageProvider`/`S3StorageProvider` abstraction moved from `apps/worker` to `packages/shared/src/server-only/report-storage.ts` (server-only subpath, not in the main browser-safe barrel — same convention as `secret-encryption.ts`) so both `apps/api` (reading) and `apps/worker` (writing) share one implementation instead of duplicating it.

## 7. Monitoring scheduler — verified, not re-implemented

Pre-implementation verification found the Watchdog monitoring scheduler (`apps/worker/src/monitoring/scheduler.ts`) was **already fully wired**: `worker.ts` calls `monitoringScheduler.start(config.MONITOR_SCHEDULER_INTERVAL_MS)` at boot and `.stop()` on graceful shutdown, with a regression test (`tests/worker-wiring.test.ts`) already guarding exactly this wiring, plus 25 passing tests across the monitoring suite covering concurrent-claim safety, retry idempotency, manual-run concurrency, and baseline ordering. This corrects a stale finding carried into `docs/RND_COMPETITIVE_FEATURE_MINING.md`'s original P0 list — see that document's §23 for the full correction. This phase's actual scheduler work was: structured JSON logging (matching the rest of the worker, replacing ad-hoc `console.error` strings), and one new test file (`tests/monitoring/scheduler-disabled.test.ts`) covering the previously-untested "disabled/archived config is never claimed" case directly against `claimMonitorSlot`.

Scheduling uses relative intervals (`computeNextRun` adds N minutes/hours/a day to "now") rather than an absolute wall-clock time-of-day — so there is no timezone-handling concern of the kind a cron-style "run at 2am" schedule would have; "timezone handling" as a review item is structurally not applicable to this design.
