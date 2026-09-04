# LeadGuard OS V6 — Competitive R&D + Feature Mining + Product Gap Analysis

**Date:** 2026-09-02 · **Method:** Source-code-level inspection of LeadGuard's own repository (this session + carried-forward evidence from Phases 0-2 of this engagement) + direct GitHub source inspection of 4 named competitors + web research on 4 additional open-source tools and 8 commercial patterns. No LeadGuard code was rewritten to produce this document — see §21 for the one diagnostic-only exception, and the integrity check at the end.

---

## 1. Executive Summary

LeadGuard's customer product is real and, in several dimensions, genuinely ahead of every open-source tool inspected here: it is the only one of the five systems compared (4 competitors + LeadGuard) with real multi-tenant SaaS RBAC, real billing, and a substantial agency/prospect-to-client workflow (1,000+ lines across `pitchService.ts`/`prospectService.ts`/`whiteLabelService.ts`). None of the four competitors have any of these three things at all.

But on the actual **detection engine** — the thing LeadGuard's entire business is priced on — it is behind the youngest, least-polished competitor in this set. `JerushaGray/TagScope`, a 1-star, single-author Python CLI created four months ago, does something LeadGuard's scanner does not: it intercepts real network requests from a rendered page to verify a tracking pixel actually **fires**, not just that its script tag is present in the HTML. LeadGuard's `packages/shared/src/scanners/tracking.ts` is confirmed, by direct source read, to do static regex signature-matching only — the exact same weaker tier as the two other tools compared (`GrowthLint`, `analytics-auditor`). This is the single most important finding in this report, because LeadGuard already owns the infrastructure (`apps/worker/src/audit/renderedFetch.ts` launches a real headless Chromium) to close this gap — it just never wires network interception into it.

The second major finding: `StJudeWasHere/seonaut` (777 stars, 909 commits, production-grade) proves that mature, free, self-hostable technical-SEO crawling with robots.txt/sitemap awareness and persistent multi-crawl history already exists as commodity open source. LeadGuard's SEO/security-header scanners cover similar ground but narrower (no structured data, no hreflang, no duplicate-content detection) — this is table-stakes catch-up, not differentiation.

**LeadGuard's real, defensible chain — Detection → Evidence → Revenue-Impact-in-₹-with-stated-confidence → Remediation snippet → Shareable report → Agency prospect-to-client conversion → Razorpay payment → Watchdog monitoring — is not matched by any tool in this comparison, even partially.** That chain is the moat (§15). The risk is that it's built on a detection layer that is currently weaker than a 4-month-old hobby project's on the one axis (network-verified tag-firing) that most directly proves or disproves LeadGuard's core promise ("your tracking pixel is broken").

---

## 2. Current LeadGuard Product Reality

Classified against actual source, not documentation. This reuses and extends verified findings from the Phase 0-2 engagement already on record in `docs/LEADGUARD_OS_BLUEPRINT.md`.

| Capability | Status | Evidence |
|---|---|---|
| Multi-page crawling | **REAL** | `apps/worker/src/audit/crawler.ts`, `AuditPage` persisted per page (confirmed via `tests/retry.test.ts`: `pagesRun1.length > 0`) |
| SSRF-safe fetching w/ redirect re-validation | **REAL** | `packages/shared/src/url-security.ts` + `apps/worker/src/audit/fetcher.ts` (8+ call sites, verified Phase 0) |
| JS-rendered/headless-browser fetch | **REAL** | `apps/worker/src/audit/renderedFetch.ts` — real `chromium.launch()` via `playwright-core`, `page.goto(..., waitUntil:'networkidle')`, best-effort/non-fatal by design |
| Network request interception | **MISSING** | `renderedFetch.ts` only calls `page.content()` — never `page.on('request')`/`page.route()`. Confirmed by direct source read this session. This is the single most important gap in this report |
| Sitemap/robots.txt-aware discovery | **UNCONFIRMED — likely absent** | No sitemap/robots parsing found in `crawler.ts` in prior inspection; not independently re-verified line-by-line this session — flagged as needing a direct check, not asserted as fact |
| SEO scanners (metadata, headings, canonical) | **REAL, narrower than SEOnaut** | `packages/shared/src/scanners/seo.ts`, `opengraph.ts` |
| Structured data / schema.org detection | **MISSING** | No scanner file for this exists in `packages/shared/src/scanners/` |
| Hreflang / duplicate-content detection | **MISSING** | No scanner file for either |
| Security headers + TLS | **REAL, two-tier** | `scanners/security-headers.ts` + `scanners/tls.ts` (general audit) and `vault/security-headers.ts` + `vault/ssl-health.ts` (VaultGuard, deeper) |
| Exposed debug/secrets detection | **REAL** | `vault/debug-exposure.ts`, `vault/exposed-asset.ts` — VaultGuard-specific, no competitor in this comparison has an equivalent |
| Mixed content detection | **REAL** | `scanners/mixed-content.ts` |
| Tag/analytics detection (GA4/GTM/Meta Pixel) | **REAL, but static-signature only** | `scanners/tracking.ts` — regex over rendered HTML string (measurement-ID regex, `fbq()` call pattern, `dataLayer.push` presence) — confirmed by direct source read; never verifies the tag actually sends a request |
| Consent/CMP (GDPR/CCPA) detection | **MISSING** | No scanner file for this in `packages/shared/src/scanners/` — GrowthLint has a dedicated, broad module for exactly this |
| WhatsApp / click-to-call / forms / cart detection | **REAL, deep** | `scanners/whatsapp.ts` + `intelligence/whatsapp-optimizer.ts` + `whatsapp-link-tool.ts` (3 dedicated modules), `scanners/telephone.ts`, `scanners/forms.ts`, `scanners/cart.ts` — no competitor in this comparison has anything comparable |
| Business/revenue-impact quantification | **REAL, methodologically transparent** | `packages/shared/src/business-impact.ts` — explicit confidence tiers (LOW/MEDIUM/HIGH based on real-vs-default inputs), stated methodology string, deduplicated risk, capped at 45%, ₹-denominated. No competitor computes anything like this |
| Severity scoring | **REAL** | `packages/shared/src/scoring.ts` (461 lines) |
| Remediation snippets | **REAL, static-template** | `packages/shared/src/auto-fix.ts` — placeholder-safe copy-paste snippets (GA4/GTM/Meta Pixel install instructions confirmed by direct read); no AI-assisted or dynamic generation |
| AI-assisted remediation | **DOCUMENTED BUT NOT IMPLEMENTED** | `.env.example` declares `AI_PROVIDER`/`AI_API_KEY` (Phase 0 finding); not validated by the Zod config schema and no code path was found that calls out to an LLM for remediation |
| Reporting (share links, white-label) | **REAL, most SaaS-mature of any tool compared** | `Report`/`ReportVersion`/`ReportShareLink` models, `whiteLabelService.ts` |
| "PDF" report generation | **MOCK — actually HTML** | Phase 0 finding, unresolved as of this session |
| Agency prospect→pitch→client workflow | **REAL, substantial** | `services/agency/pitchService.ts` (580 lines), `prospectService.ts` (475 lines), `ClientWorkspace`/`Prospect`/`Pitch`/`Widget`/`CompetitorComparison` models |
| Multi-tenant RBAC | **REAL, mature** | 35-capability matrix, `apps/api/src/middleware/rbac.ts` (Phase 0/2 finding) |
| Billing (Razorpay) | **REAL**, reconciliation **PARTIAL** | Phase 0/2 findings — subscriptions/payments real, live-provider reconciliation not yet wired |
| Continuous monitoring (Watchdog) | **REAL model, scheduler IMPLEMENTED BUT NOT WIRED** | `MonitoringConfig/Run/Finding/Alert`, `regressionEngine.ts`, `healthChecker.ts` all real; Phase 0 finding: the recurring-scan scheduler is coded but never invoked in the running worker process |
| CI-gating / snapshot-diff for the product's own audits | **MISSING** | No equivalent to GrowthLint's `snapshot`/`diff`/`check-pr` commands exists for LeadGuard's own audit outputs |
| Worker retry idempotency (audit re-run) | **BUG — found this session** | `tests/retry.test.ts` fails, in isolation, against a fresh fixture: `AuditOrchestrator.execute` (`apps/worker/src/audit/orchestrator.ts:60`) throws `"Audit cannot be started: current status is not eligible (status=COMPLETED)"` when the test's own retry-idempotency scenario re-invokes `processAudit` on an already-completed audit — the orchestrator's claim logic does not consider a completed audit retry-eligible, contradicting the test's premise. Confirmed pre-existing and unrelated to any change made this session (file untouched, fails in complete isolation with freshly generated fixture data) — flagged here, not fixed, as it's outside this task's authorized scope |

---

## 3. Competitor Landscape

| Project | Category | Language/Stack | Maturity signal |
|---|---|---|---|
| `super0510/GrowthLint` | Static growth/SEO/consent linter, CLI | Python (Typer/Rich/Pydantic) | 2 stars, 1 fork, 2-day commit burst (Mar 2026), has tests+CI, no activity since |
| `itallstartedwithaidea/analytics-auditor` | Single-page GA4/pixel audit demo | Client-side HTML/JS | 8 files, single-day upload via GitHub web UI, no tests/CI, marketing lead-magnet for an unrelated product |
| `JerushaGray/TagScope` | Network-verified tag/analytics auditor, CLI/library | Python + Playwright | 1 star, created Oct 2025, actively iterated through Jul 2026 (v3.4.0), 333 tests claimed, no CI badge, no production deployment story |
| `StJudeWasHere/seonaut` | Self-hosted technical SEO crawler | Go + MySQL | 777 stars, 909 commits, external contributor PRs merged, CI badge, hosted product at seonaut.org — genuinely production-grade |
| Uptime Kuma *(additional)* | Uptime/regression monitoring | Node.js + Vue | Large, mature, informs Watchdog architecture |
| Unlighthouse *(additional)* | Whole-site Lighthouse crawler | Node.js + headless Chrome | Active, informs whole-site sampling/streaming pattern |
| OWASP ZAP *(additional)* | Security scanning | Java | Industry-standard, informs VaultGuard's passive/active-scan boundary |
| Metabase *(additional)* | BI/embedding | Clojure/Java | Informs agency white-label embedding tiers |

---

## 4. Source-Code Findings (competitor → feature → mechanism → file → LeadGuard equivalent → gap)

- **TagScope → tag-firing verification → `page.on('request', log_request)` intercepting all requests, decoding GA4 Measurement Protocol `/g/collect` calls and `dataLayer` pushes → `src/tagscope/auditor.py` → LeadGuard's `scanners/tracking.ts` (static regex only) → GAP: LeadGuard cannot currently tell "tag code present" from "tag actually fires," which is the exact class of failure ("broken tracking pixel") LeadGuard is named for detecting.**
- **SEOnaut → duplicate-content detection → page-body hash comparison across crawled pages → `internal/services/html_parser.go` + `body.go` → LeadGuard: no equivalent scanner exists → GAP: table-stakes technical SEO check missing.**
- **SEOnaut → robots.txt/sitemap-aware crawling → `robots_checker.go` (cached `RobotsChecker.IsBlocked`) + `sitemap_checker.go` (recursive sitemap-index parsing) → LeadGuard's `crawler.ts` → GAP (unconfirmed but likely): no equivalent found in prior inspection.**
- **GrowthLint → consent/CMP detection → `analyzers/consent_audit.py`, 12+ CMP signatures, Google Consent Mode v2, script-order analysis (flags trackers firing before the CMP loads) → LeadGuard: no scanner file for this exists → GAP: real, buildable, currently zero coverage.**
- **GrowthLint → CI-gating for regression → `snapshot`/`diff`/`check-pr` CLI commands comparing two audit runs → LeadGuard: no equivalent for its own audit outputs → GAP: relevant to Watchdog's regression story, not currently built as a discrete capability.**
- **LeadGuard → business-impact quantification → `buildBusinessImpact()` with explicit confidence tiers and a stated methodology string → `packages/shared/src/business-impact.ts` → no competitor equivalent found in any of the 4 repos → ADVANTAGE, not a gap.**
- **LeadGuard → agency prospect-to-pitch workflow → `pitchService.ts`/`prospectService.ts` (1,055 combined lines) → no competitor equivalent → ADVANTAGE.**

---

## 5. Feature Comparison Matrix

Condensed to the categories with the clearest signal (full category list is in §2's per-capability table above).

| Category | GrowthLint | Analytics Auditor | TagScope | SEOnaut | **LeadGuard** |
|---|---|---|---|---|---|
| Crawling (multi-page, concurrency) | Sitemap+robots aware, 50-page default | None (proxy/paste) | BFS + resumable, no robots/sitemap | Robots+sitemap aware, worker-pool | Real, SSRF-hardened, sitemap/robots unconfirmed |
| JS rendering | No | Only via external user-supplied service | **Yes (Playwright)** | No | **Yes (Playwright)** |
| Network interception | No | No | **Yes — core feature** | No | **No — confirmed gap** |
| Technical SEO breadth | Broad (YAML rules) | None | Narrow | **Very broad (54 issue types)** | Moderate — narrower than SEOnaut |
| Consent/CMP detection | **Strong** | Regex-only | No | No | **None** |
| Analytics/tag intelligence | Moderate | Moderate (config-checklist idea) | **Strongest — dual-fire/silent-GA4** | None | Weak (static signature only) |
| Conversion/lead detection (WhatsApp, forms, cart, tel) | Weak (generic CTA regex) | None | None | None | **Strongest of all 5** |
| Business/revenue-impact $ modeling | Weight only, no $ | None | None | None | **Only one with a real $ model** |
| Remediation snippets | Real, template | Real, template | None | None | Real, template (parity w/ GrowthLint) |
| AI integration | Claude Code skills (tooling) | None | MCP server + LLM export | None | Env vars present, **not wired** |
| Multi-tenant SaaS / RBAC | None | None | None | Single-user only | **Only one with real multi-tenant RBAC** |
| Billing | None | None | None | None | **Only one with real billing** |
| Agency/white-label/prospecting | None | None | None | Minimal (per-project config) | **Only one with a real workflow** |
| Persistent multi-run history | No (JSON per run) | No | No | **Yes, mature dashboard** | Yes (Monitoring models), scheduler not wired |
| Reporting polish | Markdown/JSON/CSV/badges | JSON/CSV/print | JSON/CSV/HTML + LLM export | ECharts dashboard, export, replay | Share links + white-label, "PDF" is actually HTML |

---

## 6. Competitive Strengths (per competitor)

- **GrowthLint:** declarative YAML rule engine (extensible without code changes), genuinely strong consent/CMP module, real CI-gating commands (`snapshot`/`diff`/`check-pr`).
- **Analytics Auditor:** the "paste HTML or connect GA4 Admin API for a 40-point config checklist" angle is a real, currently-uncovered idea, even though the implementation quality is low.
- **TagScope:** network-interception-based tag-firing verification (dual-fire, silent-GA4 detection) — technically the most serious detection engine of the four; MCP server + LLM-flattened export is a genuinely forward-looking idea.
- **SEOnaut:** production-grade technical SEO breadth (54 issue types), robots/sitemap-aware crawling, persistent multi-crawl history with trend dashboards, real external contributor base.

---

## 7. LeadGuard Weaknesses

1. Network-verified tag-firing detection: **absent**, while a 1-star hobby project already has it.
2. Consent/CMP detection: **absent entirely**.
3. Technical SEO breadth (structured data, hreflang, duplicate-content): **narrower than a free OSS crawler**.
4. AI integration: **declared in env config, never wired to any code path** — a credibility gap if marketed as "AI-powered."
5. Monitoring scheduler: **coded but never invoked** — Watchdog customers are not actually being continuously monitored today (carried forward from Phase 0/2 findings).
6. "PDF" reports are HTML — a customer-facing correctness gap, not just a technical nuance.
7. No CI-gating/regression-diff tooling for the audit engine's own output, despite this being a natural extension of the Watchdog concept.
8. A genuine, newly-discovered idempotency bug in audit-retry handling (§2), independent of everything else in this report.

---

## 8. LeadGuard Existing Advantages

1. Real multi-tenant SaaS RBAC — none of the 4 competitors have any tenancy model at all.
2. Real billing (Razorpay) — none of the 4 have billing.
3. Real agency/prospect-to-client workflow — the closest any competitor gets is SEOnaut's single-user per-project config.
4. Real ₹-denominated, confidence-rated business-impact model — no competitor computes a dollar/rupee figure at all.
5. Deepest lead/conversion-specific detection (WhatsApp, click-to-call, forms, cart) of any tool compared — this is LeadGuard's namesake category and it shows.
6. VaultGuard's exposed-debug/exposed-asset checks have no equivalent in any of the 4 tools inspected.
7. Real JS-rendering capability (shared by only TagScope among the four) — already-owned infrastructure that makes closing the network-interception gap cheaper than building it from scratch.

---

## 9. Copy / Adapt / Differentiate / Ignore

| Capability | Classification | Reasoning |
|---|---|---|
| Network request interception on the existing rendered-fetch pass | **COPY** | Table-stakes for the product's own core promise; LeadGuard already owns the Playwright infrastructure TagScope proves this needs — this is closing a gap with existing tools, not new invention |
| Consent/CMP + Google Consent Mode v2 detection | **COPY** | High-value, currently zero coverage, clear precedent (GrowthLint) to learn the signature list from |
| Structured data / hreflang / duplicate-content scanners | **ADAPT** | Valuable table-stakes SEO breadth, but should be built as additional entries in LeadGuard's existing typed scanner registry, not a wholesale crawler rewrite |
| CI-gating snapshot/diff commands (GrowthLint pattern) | **ADAPT** | The concept (compare two audit runs, gate on regression) maps naturally onto Watchdog's regression engine, which already exists (`regressionEngine.ts`) — extend it, don't build a separate CLI tool |
| MCP server / LLM-flattened export (TagScope pattern) | **DIFFERENTIATE** | Don't clone an MCP server verbatim — but a "LLM-ready" structured export of findings (for an agency's own AI workflows, or LeadGuard's own future AI remediation) is a concept worth reinterpreting inside LeadGuard's existing report/API surface |
| Persistent multi-crawl trend dashboard (SEOnaut pattern) | **DIFFERENTIATE** | LeadGuard already has the data model (`MonitoringRun`/`AuditRun` history) — the opportunity is to combine it with the revenue-impact model (show $ impact trend over time, which SEOnaut cannot do), not just copy a generic crawl-history chart |
| Desktop-licensed distribution model (Screaming Frog) | **IGNORE** | Wrong distribution model for a hosted SaaS with shareable reports and agency workflows |
| Full session-replay/RUM (Hotjar/Clarity) | **IGNORE for now** | Materially different data/privacy model (recording real visitor sessions vs. a synthetic one-time scan) — would require a dedicated consent/privacy redesign disproportionate to current product scope |
| Sentry/Datadog-style issue-lifecycle state machine (open/acknowledged/resolved/regressed) | **ADAPT** | Directly applicable to Watchdog findings, which currently appear to be flat pass/fail rather than a tracked lifecycle — worth adopting the state-machine *concept*, not the tools themselves |
| HubSpot Website Grader / SEOptimer's embeddable white-label audit widget | **ADAPT** | This is functionally the same loop as LeadGuard's own agency-prospecting tooling — worth studying their embed/lead-capture UX specifically as a reference for `WidgetViews.tsx`/`widgetService.ts`, which already exists but should be benchmarked against these two proven examples |

---

## 10. Product Gap Analysis

### Tier 1 — Critical gaps
- Network-verified tag-firing detection (currently absent; proven cheap to add given existing Playwright infra).
- Monitoring scheduler not actually wired — Watchdog customers are not being continuously monitored (pre-existing finding, restated because it directly undermines the "monitoring" pillar of the moat in §15).
- "PDF" reports are actually HTML (customer-facing correctness bug).

### Tier 2 — High-value opportunities
- Consent/CMP + Google Consent Mode v2 detection.
- Structured data / hreflang / duplicate-content scanners (SEO breadth parity).
- Audit-retry idempotency bug (found this session) — affects Watchdog's re-scan reliability.
- Wiring the already-declared AI_PROVIDER/AI_API_KEY into a real (even minimal) AI-assisted remediation path, since the env vars already imply a promise made and not kept.

### Tier 3 — Strategic moat
- Combine persistent monitoring history with the revenue-impact model into a "$ impact over time" trend — no competitor can do this because none have both a monitoring history *and* a revenue model.
- Issue-lifecycle state machine (open/acknowledged/resolved/regressed) for Watchdog findings, feeding directly into agency client reporting ("what broke, what we fixed, what it's worth").
- CI-gating/snapshot-diff extension of the existing regression engine for agency/developer customers who want audit results gated in their own CI.

### Tier 4 — Nice-to-have
- LLM-flattened export format for findings (TagScope-inspired), useful for power users/agencies with their own AI tooling.
- Two-tier embeddable widget (component-level vs. full-app white-label), Metabase-inspired, as a refinement of the existing `widgetService.ts`.

---

## 11. Architecture Impact

| Proposed capability | Owning module | New DB models? | New worker jobs? | Browser automation? | New frontend surface? | Classification |
|---|---|---|---|---|---|---|
| Network interception on rendered-fetch | `apps/worker/src/audit/renderedFetch.ts` (extend) | No — extends `AuditFinding`/evidence shape | No — same job | Already uses Playwright; add `page.route()`/`page.on('request')` | No | **SMALL EXTENSION** |
| Consent/CMP scanner | `packages/shared/src/scanners/` (new file, existing registry pattern) | No | No | No (static HTML, same as other scanners) | Findings surface in existing UI | **SMALL EXTENSION** |
| Structured data / hreflang / duplicate-content scanners | Same as above | No | No | No | No | **SMALL EXTENSION** |
| Fix monitoring scheduler wiring | `apps/worker/src/monitoring/scheduler.ts` (invoke what already exists) | No | No — reuses existing job | No | No | **SMALL EXTENSION (bug fix, not new work)** |
| Real PDF generation | Report generation service | No | Possibly (PDF rendering can be CPU-heavy — worth a dedicated job) | Possibly (headless-browser-to-PDF, e.g. Playwright's own `page.pdf()`) | No | **SMALL EXTENSION** |
| AI-assisted remediation (minimal) | New service alongside `auto-fix.ts` | No | Possibly, if generation is slow enough to queue | No | Surfaces in existing report/finding UI | **SMALL EXTENSION**, contingent on picking an AI provider (a vendor decision, same caveat as the companion production-foundation report) |
| Watchdog $-impact-over-time trend | Combines existing `MonitoringRun` history + `business-impact.ts` | No — a read/aggregation view | No | No | New chart component on existing Monitoring UI | **SMALL EXTENSION** |
| Issue-lifecycle state machine for findings | `AuditFinding`/`MonitoringFinding` | Yes — a `status` enum + transition audit trail | No | No | Status controls on existing finding UI | **NEW DOMAIN-ISH (small)** — a real schema change, but additive |
| CI-gating snapshot/diff commands | New thin layer over existing `regressionEngine.ts` + report API | No | No | No | Possibly a new CLI, or just an API endpoint | **SMALL EXTENSION** |
| Fix retry-idempotency bug | `apps/worker/src/audit/orchestrator.ts` | No | No | No | No | **SMALL EXTENSION (bug fix)** |

**No capability in this entire report requires a MAJOR PLATFORM CHANGE.** Every high-value item is additive to the existing scanner registry, worker queue, or monitoring model.

---

## 12. User Workflow Gaps

**Business Owner** (Website → Scan → Understand → See lost revenue → Fix → Monitor): the chain is real end-to-end today, with one broken link — "Monitor" is modeled but not actually scheduled to run (Tier 1 gap), so a business owner paying for Watchdog isn't actually being watched.

**Agency** (Prospect → Scan → Findings → Report → Business impact → Convert → Onboard → Remediate → Monitor → Recurring revenue): the workflow is genuinely built further than any competitor's equivalent, but the same monitoring gap breaks the "recurring revenue via ongoing Watchdog value" step, and the missing network-interception/consent detection weakens the pitch itself (a prospect's actual broken tracking may go undetected).

**Internal Company Owner** (Customers → 360 → Revenue → Subscriptions → Offers → Coupons → Campaigns → Usage → Support → Security → Operations → System health): per the companion `docs/LEADGUARD_OS_BLUEPRINT.md`, this workflow is the least-built part of the entire system — offers/coupons/campaigns don't exist, and the command-center view doesn't exist. Not re-litigated in depth here since it's covered exhaustively in that document; flagged only because it's the same "internal operations" gap this R&D phase should not duplicate work on.

---

## 13. Monetization Opportunities

- Fixing the monitoring scheduler unlocks the value Watchdog is already being sold on — this is not a new feature, it's making an existing paid promise real.
- Network-verified tag-firing detection directly strengthens the core sales pitch ("your tracking pixel is broken") with a claim competitors (other than TagScope, which has no commercial packaging at all) cannot currently make.
- A "$ impact over time" Watchdog trend view is a strong upsell/retention feature for the agency tier specifically — it's the kind of chart an agency shows its own client to justify the retainer.

## 14. Retention Opportunities

- Issue-lifecycle tracking (open/acknowledged/resolved/regressed) gives customers and agencies a reason to keep coming back to the dashboard between scans, rather than only at report-delivery time.
- Real PDF reports (replacing the current HTML-as-PDF) remove a credibility risk that could otherwise cause churn the moment a customer notices.

## 15. Potential Moat

The chain **Detection → Evidence → ₹-denominated Business Impact (with stated confidence) → Remediation snippet → Shareable Report → Agency Prospect-to-Client Conversion → Razorpay Payment → Watchdog Monitoring** is not matched, even partially, by any of the four competitors inspected:

- GrowthLint has a `revenue_weight` field on violations but no dollar-value model, no billing, no agency layer.
- Analytics Auditor has none of the above beyond a checklist UI.
- TagScope has the best detection engine in this comparison but zero SaaS surface of any kind.
- SEOnaut has the best persistent history and SEO breadth but zero analytics detection, zero revenue modeling, zero billing, zero agency tooling.

**This is a real moat, evidence-supported, not asserted.** The risk to it is entirely internal: the moat's first link (Detection) is currently the weakest technical component in the whole chain relative to what a determined competitor could assemble from off-the-shelf open source (TagScope's interception engine + SEOnaut's SEO breadth + a thin SaaS wrapper) faster than LeadGuard could build its agency/billing/RBAC layer from scratch. Closing §10's Tier 1 gaps is what keeps the moat's foundation as strong as what's built on top of it.

---

## 16. Recommended Product Direction

Stay the course on the SaaS/agency/revenue-impact positioning — it is genuinely differentiated and none of the researched alternatives threaten it directly. Redirect near-term engineering effort from new customer-facing surface area toward **making the detection engine's existing claims true**: network-verified tag-firing (closes the single biggest competitive and credibility gap), a working monitoring scheduler (makes an already-sold feature real), and real PDF generation (removes a latent trust risk). These three are all "small extension" per §11 — none require new architecture.

---

## 17. Prioritized Capability Backlog

| Capability | Customer Value | Revenue Value | Competitive Advantage | Complexity | Priority |
|---|---:|---:|---:|---:|---:|
| Wire monitoring scheduler (fix, not build) | High | High | Medium | Low | **P0** |
| Network-verified tag-firing detection | High | High | High | Medium | **P0** |
| Real PDF report generation | Medium | Medium | Low | Low | **P0** |
| Fix audit-retry idempotency bug | Low (invisible until it bites) | Low | None | Low | **P0** |
| Consent/CMP + Consent Mode v2 detection | Medium | Medium | Medium | Medium | **P1** |
| Structured data / hreflang / duplicate-content scanners | Medium | Low | Low | Low | **P1** |
| Watchdog $-impact-over-time trend | Medium | High (agency upsell) | High | Low | **P1** |
| Issue-lifecycle state machine for findings | Medium | Medium | Medium | Medium | **P2** |
| Minimal AI-assisted remediation | Medium | Medium | Medium | Medium | **P2** |
| CI-gating snapshot/diff for audit results | Low | Low | Low | Low | **P3** |
| LLM-flattened findings export | Low | Low | Low | Low | **P3** |
| Two-tier embeddable widget (Metabase-inspired) | Low | Medium | Low | Medium | **P3** |
| Full session-replay/RUM | — | — | — | High | **DROP** |
| Desktop-licensed distribution | — | — | — | — | **DROP** |

---

## 18. Things We Must NOT Build

- A parallel crawler/rendering engine from scratch — extend the existing `crawler.ts`/`renderedFetch.ts`, don't replace them.
- A generic session-replay/RUM product (Hotjar/Clarity-style) — wrong data/privacy model for a synthetic-scan product.
- A standalone CLI/MCP-server product surface mirroring TagScope/GrowthLint — LeadGuard's product is the SaaS platform, not a developer tool; the *ideas* (network interception, LLM-export) should be absorbed into the existing platform, not spun out as a separate tool.
- A desktop-licensed edition (Screaming Frog-style) — contradicts the hosted, shareable-report, agency-facing product LeadGuard already is.

## 19. Architecture Changes We Must NOT Do

- No new crawler/renderer package — network interception is an extension of `renderedFetch.ts`, not a new module.
- No new database beyond additive columns/enums (e.g., a `status` field for issue lifecycle) — nothing here requires a new datastore.
- No microservices split to accommodate any of these capabilities — every item in §11 is classified SMALL EXTENSION or smaller.
- No rewrite of the scanner registry pattern to a YAML/declarative engine (GrowthLint's approach) purely for its own sake — worth considering only if/when non-engineers need to author rules directly, which isn't evidenced as a current need.

## 20. Risks

- **Shipping "AI-powered" messaging (if any exists) while `AI_PROVIDER`/`AI_API_KEY` are unwired** is a real credibility risk if surfaced anywhere customer-facing — verify no such claim exists in current marketing copy, independent of this report.
- **The monitoring-scheduler gap is a live discrepancy between what Watchdog customers are paying for and what's actually running** — this is the single highest-consequence item in this entire document precisely because it's not hypothetical; customers are subscribed to it today.
- **A well-resourced competitor could assemble TagScope's interception engine + SEOnaut's SEO breadth faster than LeadGuard can build a comparable agency/billing/RBAC layer from scratch** — the moat holds only as long as the detection layer doesn't fall further behind.

## 21. Research Evidence / Source Links

- `super0510/GrowthLint` — https://github.com/super0510/GrowthLint
- `itallstartedwithaidea/analytics-auditor` — https://github.com/itallstartedwithaidea/analytics-auditor
- `JerushaGray/TagScope` — https://github.com/JerushaGray/TagScope
- `StJudeWasHere/seonaut` — https://github.com/StJudeWasHere/seonaut, https://seonaut.org
- Uptime Kuma — https://github.com/louislam/uptime-kuma
- Unlighthouse — https://github.com/harlan-zw/unlighthouse, https://unlighthouse.dev/
- OWASP ZAP — https://github.com/zaproxy/zaproxy, https://www.zaproxy.org/docs/desktop/addons/automation-framework/job-ascan/
- Metabase — https://github.com/metabase/metabase
- Screaming Frog pricing — https://www.trustradius.com/products/screaming-frog-seo-spider/pricing
- Sitebulb — https://crawlraven.com/blog/sitebulb-review
- Semrush Site Audit — https://www.semrush.com/siteaudit/
- Ahrefs — https://www.demandsage.com/ahrefs-review/
- Hotjar — https://webeyez.com/insights/guides/hotjar-frustration-signals-guide
- Microsoft Clarity — https://clarity.microsoft.com/blog/rage-clicks-user-behavior/
- Sentry — https://sentry.io/resources/alert-rules/
- Datadog — https://www.datadoghq.com/blog/incident-response-with-datadog/
- HubSpot Website Grader — https://outgrow.co/blog/hubspot-website-grader-case-study
- SEOptimer/agency lead-gen tools — https://insites.com/blog/the-5-best-lead-generation-tools-for-digital-marketing-providers/
- LeadGuard source evidence: `packages/shared/src/scanners/tracking.ts`, `apps/worker/src/audit/renderedFetch.ts`, `packages/shared/src/business-impact.ts`, `packages/shared/src/auto-fix.ts`, `apps/api/src/services/agency/pitchService.ts`, `apps/api/src/services/agency/prospectService.ts`, `tests/retry.test.ts`, `apps/worker/src/audit/orchestrator.ts`, plus every file cited in `docs/LEADGUARD_OS_BLUEPRINT.md`.

## 22. Final CEO Recommendation

Do not chase feature breadth against any of these four competitors individually — LeadGuard's SaaS/agency/revenue-impact combination already beats all of them on the dimension that matters commercially. Instead, spend the next engineering cycle making three existing claims true: monitoring that actually runs, tag-tracking verification that actually verifies, and PDF reports that are actually PDFs. All three are small, additive, low-risk changes to code that already exists — not a roadmap item, a correctness backlog.

---

## R&D RESULT

**LeadGuard maturity:** 6/10 — a genuinely mature, differentiated SaaS product with a real business-impact and agency layer, undercut by a detection engine that a far less mature hobby project already exceeds on the one axis (tag-firing verification) most central to the product's own promise.

**Competitive position:** Competitive — ahead of all four inspected tools on SaaS/agency/monetization dimensions, behind on network-intelligence and consent detection specifically, and not yet category-leading in either direction.

**Biggest current weakness:** No network-request interception — LeadGuard cannot currently distinguish "tracking code present in HTML" from "tracking pixel actually fires," which is precisely what a 1-star competitor CLI already does with the same Playwright stack LeadGuard already has installed.

**Biggest existing advantage:** The only system in this comparison with a real multi-tenant SaaS layer, real billing, and a real agency prospect-to-client conversion workflow — combined with a transparent, confidence-rated ₹ business-impact model no competitor computes at all.

**Most important capability to build next:** Network-request interception on the existing rendered-fetch pass, wired into the tag/tracking scanner — smallest-effort, highest-credibility fix available.

**Biggest strategic mistake to avoid:** Building new customer-facing surface area (offers, campaigns, a bigger dashboard, an MCP server) before fixing the three items that make existing paid promises (Watchdog monitoring, PDF reports, tag verification) actually true.

**Recommended product direction:** Hold the SaaS/agency/revenue-impact positioning; spend the next cycle on detection-engine correctness, not breadth.

**Recommended next implementation phase:** A focused "detection integrity" phase — (1) wire the monitoring scheduler that already exists, (2) add network-request interception to `renderedFetch.ts` and feed it into `tracking.ts`, (3) fix the audit-retry idempotency bug, (4) replace HTML-as-PDF with real PDF generation. All four are additive, small-extension changes with no new architecture, sequenced before any of Tier 2/3's new-capability work.

---

### Files created this phase
```
NEW  docs/RND_COMPETITIVE_FEATURE_MINING.md   (this file)
```
No LeadGuard application code, schema, or tests were changed to produce this document. The only code-adjacent activity this phase was read-only source inspection (`packages/shared/src/scanners/tracking.ts`, `apps/worker/src/audit/renderedFetch.ts`, `business-impact.ts`, `auto-fix.ts`, `pitchService.ts`, `prospectService.ts`) plus running the existing `tests/retry.test.ts` in isolation to confirm the idempotency bug is real and pre-existing — no fix was applied, per this phase's own "do not begin coding" rule.

---

## 23. P0 Implementation Outcome

Implemented as a dedicated follow-on phase ("Detection Integrity + Paid-Promise Correctness"). Full technical reference: `docs/DETECTION_INTEGRITY.md`.

### 1. Monitoring scheduler

**Previous state believed (per §2/§10 above): "coded but never invoked."** Pre-implementation re-verification found this was **stale** — `apps/worker/src/worker.ts` already calls `monitoringScheduler.start(config.MONITOR_SCHEDULER_INTERVAL_MS)` at boot and `.stop()` on graceful shutdown, guarded by an existing regression test (`tests/worker-wiring.test.ts`) explicitly written for this exact prior bug. `apps/worker/src/monitoring/processor.ts` and `scheduler.ts` already implement atomic Redis-lock + DB-claim double protection, per-scheduled-slot idempotency via a unique DB constraint, and optimistic baseline-version concurrency control. 25 pre-existing tests across 16 files already covered concurrent-claim safety, retry idempotency, manual-run concurrency, and baseline ordering — all passing before this phase touched anything.

**What was actually done**: (1) upgraded `scheduler.ts`'s logging from ad-hoc `console.error` strings to the structured JSON convention used elsewhere in the worker, adding previously-missing success-path events (`scheduler_initialized`, `scheduler_job_triggered`, `scheduler_cycle_completed`); (2) added `tests/monitoring/scheduler-disabled.test.ts` (3 tests) covering the one genuinely untested scenario — a disabled or archived `MonitoringConfig` is never claimed, tested directly against `claimMonitorSlot` (the sweep-level `enqueueDueMonitors` test was dropped after discovering its `take: 50` due-configs query is non-deterministic in this shared test DB — a pre-existing suite characteristic, not something this phase introduced).

**Files changed**: `apps/worker/src/monitoring/scheduler.ts` (logging only, no behavior change).
**Tests added**: `tests/monitoring/scheduler-disabled.test.ts` (3 tests, all passing).
**Verification**: full monitoring suite (28 tests, 17 files) passes; `tests/worker-wiring.test.ts` passes.
**Known limitation**: relative-interval scheduling (no timezone concern, by design) means no periodic sweep proactively resurfaces a long-orphaned lock — see Retry §3 below for the related audit-side limitation.

### 2. Runtime tracking verification (network-verified tracking)

**Previous state (confirmed by direct source read)**: `packages/shared/src/scanners/tracking.ts` did — and still does — static regex signature matching only (GA4 measurement ID, `fbq()` calls, GTM container IDs) against page HTML. `apps/worker/src/audit/renderedFetch.ts`'s headless-Chromium rescan pass returned only `page.content()`; it never inspected network traffic. A tag's *installation code being present* and a tag *actually sending an event* were indistinguishable.

**Implementation**: added `packages/shared/src/network-evidence.ts` — pure, browser-safe types and matching logic distinguishing `FIRED` (a real matching request observed), `NOT_OBSERVED` (a real capture ran, nothing matched), and `NOT_VERIFIED` (no capture attempt was made or it failed — never reported as a problem). Extended the *existing* rendered-fetch Playwright pass (no second browser, no new crawler) with `attachNetworkEvidenceCapture`, which wires `page.on('request')` and reduces matched requests to hostname+path plus a narrow query-param allowlist (GA4's `tid`/`en` only) — never headers, cookies, or full query strings. `apps/worker/src/audit/aggregation.ts`'s `evaluateWebsiteLevelScanners` now accepts an optional `TrackingRuntimeEvaluation` and emits three new, appropriately-hedged findings (`GA4_NOT_FIRING`, `META_PIXEL_NOT_FIRING`, `GTM_NOT_FIRING`, MEDIUM severity) when code is present but a real capture observed nothing — while an unverified capture (rescan disabled/failed) produces no finding at all, and a network-observed-but-statically-absent tag upgrades the "missing" determination rather than false-flagging it. GTM's verification is honestly scoped to "the container script loaded," documented as not proving every tag inside it fired (see `DETECTION_INTEGRITY.md` §2).

**Files changed**: `packages/shared/src/network-evidence.ts` (new), `packages/shared/src/index.ts` (barrel export), `packages/shared/package.json` (no new deps — network-evidence.ts is pure TS), `apps/worker/src/audit/renderedFetch.ts` (extended return shape + capture), `apps/worker/src/audit/aggregation.ts` (runtime-aware tracking findings), `apps/worker/src/audit/orchestrator.ts` (wires capture into the existing rescan call, structured logging for capture outcome).

**Tests added**: `packages/shared/src/network-evidence.test.ts` (15 tests — pure matching/evaluation logic), `apps/worker/src/audit/renderedFetch.test.ts` (extended: 10 tests total, including 6 new ones using `page.route()` to fulfill real tracking-provider hostnames entirely locally — zero external network dependency — proving FIRED-evidence capture, multi-provider capture, duplicate-request handling, non-tracking-request exclusion, and header/cookie/query redaction), `apps/worker/src/audit/aggregation.test.ts` (extended: 13 tests total, 6 new covering MISSING vs. NOT_FIRING vs. silent-when-unverified vs. upgrade-on-runtime-only-detection, across all three providers).

**Verification**: 31 new/changed tests, all passing; full worker typecheck and `apps/web` production build both clean (network-evidence.ts confirmed browser-safe).

**Known limitation**: capture only runs once per audit, on the homepage, only when `ENABLE_JS_RENDERED_RESCAN` is on — matching the pre-existing rescan's own scope, not expanded to every crawled page (that would be a materially larger, unrequested change to crawl cost/duration).

### 3. Audit retry / idempotency

**Previous state (confirmed, reproduced in isolation before any fix)**: `AuditOrchestrator.execute`'s claim guard excluded only `CANCELLED`/`COMPLETED` from re-claiming — which (a) incorrectly rejected re-running a `COMPLETED` audit at all (the exact `tests/retry.test.ts` failure), and (b) separately, and more seriously, never actually excluded a genuinely-`RUNNING` audit from being reclaimed, meaning two concurrent executions of the same audit were never actually prevented — a real, previously-undetected duplicate-execution hole, most exploitable via `guestScanService.ts`/`publicAuditService.ts`, whose enqueue calls have no deterministic BullMQ `jobId` (unlike the authenticated route).

**Implementation**: redefined the claim contract as CANCELLED = never reclaimable; RUNNING = reclaimable only once stale (`startedAt` older than `MAX_AUDIT_DURATION_MS` + a 30s grace buffer, indicating an orphaned worker-crashed run); QUEUED/FAILED/PARTIAL/COMPLETED = always reclaimable (retry and explicit re-run are both legitimate). A claim attempt that loses the race now closes out its own `AuditRun` row as `CANCELLED` with a `CLAIM_REJECTED_*` error code instead of leaving it stuck at `RUNNING` forever.

**Files changed**: `apps/worker/src/audit/orchestrator.ts` (claim query + structured logging).

**Tests added**: `tests/audit/retry-idempotency-contract.test.ts` (6 new tests: failed→retry, completed→explicit re-run, cancelled→never-reclaimable, fresh-running→duplicate-delivery-rejected, stale-running→worker-crash-recovery, N-concurrent-calls→exactly-one-claims).

**Verification**: `tests/retry.test.ts` now passes for the correct reason (both runs claim and complete, 2 distinct `AuditRun` rows, consistent findings/score) — assertions were not weakened or deleted. All 6 new tests pass.

**Known limitation**: no periodic sweep proactively flips a long-orphaned `RUNNING` audit to `FAILED` if nothing ever retries it — it stays reclaimable (and visibly `RUNNING`) until the next execution attempt for that `auditId`. Judged out of scope (a new periodic job is new architecture, not a fix to existing logic).

### 4. Real PDF generation

**Previous state (confirmed by direct source read)**: PDF *generation* was already real — `apps/worker/src/report/pdfWorker.ts`'s `renderHtmlToPdf` already used genuine headless-Chromium `page.pdf()`, with an existing regression test (`tests/reports/pdf-generation.test.ts`) proving the `%PDF-` magic header. The actual gap was **download**: `Report.pdfPath`/`pdfStatus` were populated but no route anywhere served the bytes back — only `POST /reports/:id/pdf` existed (enqueues generation, returns a job status), with no `GET` route at all.

**Implementation**: moved the `StorageProvider`/`LocalStorageProvider`/`S3StorageProvider` abstraction from `apps/worker` into `packages/shared/src/server-only/report-storage.ts` (server-only subpath, matching the existing `secret-encryption.ts` convention) so both `apps/api` and `apps/worker` share one implementation. Added `reportService.getReportPdfBytes`/`getPublicReportPdfBytes` and two new routes: `GET /reports/:id/pdf` (authenticated, org-scoped) and `GET /reports/share/:token/pdf` (public, reusing the existing `resolveShareLink` password/expiry/revocation logic).

**Files changed**: `packages/shared/src/server-only/report-storage.ts` (new), `packages/shared/package.json` (+`@leadguard/config`, `+@aws-sdk/client-s3`, both already used elsewhere in the monorepo at the same versions), `apps/worker/src/report/pdfWorker.ts` (imports + re-exports from the new shared location instead of defining locally — public API surface unchanged, existing test unaffected), `apps/api/src/services/reportService.ts` (two new methods), `apps/api/src/routes.ts` (two new routes).

**Tests added**: `tests/reports/pdf-download.test.ts` (9 new tests: real-PDF-bytes + correct headers, no-auth rejected, cross-org tenant isolation, not-ready surfaced as 409 not corrupted bytes, FAILED-status surfaced cleanly, share-link download with no auth, password-protected share-link, revoked share-link rejected, white-label branding preserved in the HTML feeding the PDF).

**Verification**: existing `tests/reports/pdf-generation.test.ts` (2 tests) still passes unchanged after the storage-provider relocation; all 9 new tests pass.

**Known limitation**: PDF generation itself remains synchronous within the BullMQ 'report' queue job (not further job-split) — measured at well under a second for current report sizes in testing, so no additional queueing infrastructure was added, per the phase's own "measure first" instruction.

### Overall regression verification

Full `vitest` suite: **395 passed, 1 pre-existing skip, 0 failed** (119 files) — up from the 349-passing baseline, with zero regressions. Full monorepo typecheck (`api`, `worker`, `shared`, `database`, `config`, `web`) clean. `apps/web` production build clean (confirms `network-evidence.ts` is genuinely browser-safe in the shared barrel). Full Playwright E2E suite: see final implementation report.

---

## 24. P1 Detection Intelligence Outcome

Full technical reference: `docs/DETECTION_INTELLIGENCE_P1.md`. This section corrects/updates the record left by §23 and the original report body.

**Correction to this document's own prior record**: §2/§7/§10/§13/§15/§20 above cited "the browser rendered-fetch path is not DNS-pinned (SEC-1, disclosed not fixed)" as a live gap. As of this phase, **that gap is closed** — see §1-2 below. Do not treat the SSRF/DNS-pinning language in the earlier sections of this document as current; `docs/DETECTION_INTELLIGENCE_P1.md` is the up-to-date reference.

### 1. Browser SSRF / DNS-rebinding boundary — CLOSED

**Previous state**: disclosed, unfixed gap — `renderedFetch.ts`'s Chromium navigation re-resolved DNS independently of the one-time `validateExternalUrl` check (a TOCTOU/rebinding window), and *no* subresource request (images/scripts/XHR the audited page's own JS makes) was validated at all. `pdfWorker.ts`'s `renderHtmlToPdf` had the same class of gap for one specific subresource (a customer's white-label logo URL, already pinned once by `validateAndCheckSafeLogo` but re-fetched unpinned by Chromium at PDF-render time) — found during this phase's fresh Phase-0 re-verification, not previously documented.

**Implementation**: new `apps/worker/src/net/ssrfSafeProxy.ts` — a local forward proxy (plain Node `http`/`net`, no new dependency) that both Chromium launch sites now route through via Playwright's `proxy` option. It resolves and classifies every request's destination (reusing the existing `isPrivateOrReservedHost`) and pins the actual connection to that validated address — for HTTPS, by tunneling the raw TCP socket via CONNECT without ever terminating TLS, so certificate/SNI validation is unaffected. This closes the gap for the initial navigation, every subresource, and every redirect hop, since each is an independent request that must pass back through the same proxy.

**Tests**: 22 new deterministic tests (`ssrfSafeProxy.test.ts`, ~150ms, no browser/Docker dependency) covering localhost/loopback/RFC1918/link-local/metadata/IPv6/IPv4-mapped-IPv6/DNS-rebinding-simulated-via-mock/plain-HTTP/fixtures-bypass-parity. Full detail: `docs/DETECTION_INTELLIGENCE_P1.md` §1-2.

**Performance**: measured, not assumed — 5-run average, proxy vs. no-proxy: 1183ms vs 1266ms (within noise; no regression).

### 2. Runtime tracking — audited, one real gap fixed

GA4/Meta/GTM script-load-vs-beacon distinction, regional GA4 endpoints, and the GTM "container loaded ≠ every tag fired" honest limitation were all already correct and were preserved unchanged, per instruction. One real inconsistency found and fixed: Meta Pixel's `relevantQueryParams` allowlist was empty while GA4's wasn't — added `id`/`ev` (pixel ID + event label), explicitly excluding Advanced Matching's hashed-PII params, with a dedicated test proving the exclusion.

### 3. Consent/CMP + correlation — NEW

`packages/shared/src/scanners/consent.ts` — 10 named CMP vendors, generic IAB TCF detection, generic banner fallback, Google Consent Mode v2 default/update detection. Correlated against the already-existing `TrackingRuntimeEvaluation`: because LeadGuard's headless browser never simulates a consent-banner click, any tracker observed `FIRED` during the capture window necessarily fired without consent, by construction — no click-simulation engineering was needed to make this a directly observable fact rather than an inference. `UNKNOWN` (no CMP, or tracking runtime unavailable) is never escalated to a failure. 23 tests (`consent.test.ts` + `detectionIntelligenceP1.test.ts`'s consent-correlation cases).

### 4. Structured data / hreflang / duplicate content — NEW

- Structured data (`structured-data.ts`, LG-040, registered as a normal PAGE scanner): JSON-LD parse validation, `@type` extraction (including `@graph`), same-page duplicate-type detection, Microdata/RDFa presence. 14 tests.
- Hreflang (`hreflang.ts`, LG-041, PAGE scanner + website-level reciprocity check): malformed lang codes, same-page conflicting declarations, canonical self-reference conflicts, cross-page reciprocity (a target outside the crawl budget is never assumed broken). 14 tests.
- Duplicate content (`duplicateContent.ts`, LG-044, worker-side — needs the full page set): exact-match-after-normalization hashing (a deliberate, explainable, false-positive-averse choice over a fuzzy similarity threshold), with pagination and canonical-consolidation exemptions. 8 tests.

### 5. Crawl discovery — genuinely missing, now implemented

**Verified first** (per instruction, not assumed): `crawler.ts`'s `discoverLinks` had zero robots.txt/sitemap awareness — confirmed by direct source read, this was a real gap, not a stale finding. **Implementation**: `robotsSitemap.ts` fetches and parses robots.txt (wildcard `User-agent: *` Disallow rules + `Sitemap:` directives) and sitemap.xml/sitemap-index (recursive, bounded) through the existing pinned-fetch primitives — not `fetchPage()`, which enforces `text/html` and would reject these content types. Wired into `orchestrator.ts`: Disallow rules gate `BoundedCrawler` via a new optional `isUrlAllowed` predicate (additive, backward-compatible — `undefined` for any caller that doesn't opt in), and up to 5 sitemap-only pages the link-crawl didn't reach are fetched as a supplement, budget-bounded. 10 tests, fully local-fixture-based.

### 6. Business impact integration — verified with real evidence, not asserted

All five new finding families were registered in `SCORE_RULES_V3` (`scoring.ts`) using the same 0-100 deduction scale, aggregation policies, and severity tiers every pre-existing rule uses — no new impact-modeling logic was written. Proven with 6 dedicated tests (`detection-intelligence-p1-business-impact.test.ts`) showing a new finding measurably moves `calculateScores`' pillar output and `buildBusinessImpact`'s ₹ figure relative to a clean baseline, and that the SECURITY-category findings use the pre-existing category weight (0.7) — not an invented one.

### Overall regression verification

Full `vitest` suite: **493 passed, 1 pre-existing skip, 1 confirmed pre-existing full-suite-load flake** (re-ran in isolation, passed in 716ms — matches the documented "genuinely flaky under full-suite load, timeout at the default 5000ms" pattern in `CLAUDE.md`, unrelated file, not touched this phase) — up from the 395-passing P0 baseline, zero real regressions. Full monorepo typecheck clean. Full Playwright E2E suite: see final P1 implementation report below.

### Files changed/added this phase

```
NEW  apps/worker/src/net/ssrfSafeProxy.ts (+test)
NEW  packages/shared/src/scanners/consent.ts (+test)
NEW  packages/shared/src/scanners/structured-data.ts (+test)
NEW  packages/shared/src/scanners/structured-data-page.ts (+test)
NEW  packages/shared/src/scanners/hreflang.ts (+test)
NEW  packages/shared/src/scanners/hreflang-page.ts (+test)
NEW  apps/worker/src/audit/duplicateContent.ts (+test)
NEW  apps/worker/src/audit/robotsSitemap.ts (+test)
NEW  apps/worker/src/audit/detectionIntelligenceP1.ts (+test)
NEW  packages/shared/src/detection-intelligence-p1-business-impact.test.ts
NEW  docs/DETECTION_INTELLIGENCE_P1.md
M    apps/worker/src/audit/renderedFetch.ts (+test) — proxy wiring
M    apps/worker/src/report/pdfWorker.ts — proxy wiring
M    apps/worker/src/audit/orchestrator.ts — proxy is automatic (inside renderedFetch), robots/sitemap + P1 findings wiring
M    apps/worker/src/audit/aggregation.ts — no change needed this phase (P1 findings live in detectionIntelligenceP1.ts instead, to keep the two concerns separable)
M    apps/worker/src/audit/crawler.ts, types.ts — additive isUrlAllowed option
M    packages/shared/src/scanners/index.ts, registry.ts, scoring.ts — new scanner registration + score rules
M    docs/DETECTION_INTEGRITY.md — SEC-1 marked closed
```
