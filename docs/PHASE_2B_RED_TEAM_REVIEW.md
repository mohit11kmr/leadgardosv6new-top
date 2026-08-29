# Phase 2B — Independent Red-Team Review of the Phase 2A Product UX Blueprint

> **Scope**: Review ONLY. Challenges the product model, homepage, scan funnel, result page, dashboard, audit detail, watchdog, agency platform, design system, components, state model, responsive/accessibility/performance claims, backend-contract alignment, and fake-data trust risks of `PHASE_2A_PRODUCT_UX_BLUEPRINT.md` and `PHASE_2A_DESIGN_SYSTEM.md`.
> **Base commit reviewed**: `1cc0d8c3f4a1c0133825de88c013a1298ef4ea14`
> **Verification basis**: source inspection (not just docs). Every claim below is traced to `packages/shared`, `apps/api`, `apps/web`, or a direct runtime measurement.
> **Tagging convention**: `SUPPORTED` = verifiable against current source/runtime; `UNSUPPORTED` = not backed by current source, requires net-new capability; `IMPOSSIBLE-BELOW-4.5` = measured contrast deficit.
> **Classification**: every Phase 2A recommendation is tagged **KEEP / MODIFY / REMOVE / DEFER**. Final blueprints appear in §21 and the scorecard in §22.

---

## 1. Executive Summary

Phase 2A is a strong, source-aligned blueprint that resolves several genuine P1s (fake homepage metrics, 1.25 MB bundle, 375px overflow) with sound, low-risk approaches. It marks **KEEP** for 9 of 15 roadmap items and correctly defers the highest-risk net-new builds.

However, the red-team found **two structural defects** that must be fixed before approval:

1. **The product model is internally inconsistent.** The blueprint asserts **three different pillar framings** that disagree with each other and with the shipped engine:
   - **5 strategic pillars** (Diagnostic Engine / Lead Leakage / Revenue Intelligence / Watchdog / Agency) — §1.
   - **4 marketing "Pillars of Lead Leakage"** (Form / Ads / WhatsApp / Watchdog) — §4.
   - **4 scored pillars actually implemented** (`LEAD` 35% / `ADVERTISING` 25% / `SEO` 20% / `SECURITY` 20%) — `packages/shared/src/scoring.ts:423`, rendered in `ScanResultView.tsx:15-20`.
   Only the last one is real. (§3, §6.)
2. **Accessibility numbers are wrong and conceal a real AA failure.** The documented "14.2:1" and "5.1:1" contrasts are **incorrect measurements** (actual 18.57:1 and 6.97:1 for those token pairs), and the doc **omits the tokens that actually fail**: `--text-muted #64748b` on `--bg-surface #111726` = **3.76:1 (fails WCAG AA 4.5:1 for normal text)** and `--purple #8b5cf6` = 4.22:1 (fails for small text). (§15.)

Both defects are fixable with small MODIFY edits; neither invalidates the blueprint as a whole.

---

## 2. Verification Methodology

| Claim class | Evidence source |
| :--- | :--- |
| Scoring weights / pillars | `packages/shared/src/scoring.ts` (read) |
| Conversion risk model | `packages/shared/src/business-impact.ts` (read) |
| Pillar rendering on result page | `apps/web/src/features/scan/ScanResultView.tsx` (read) |
| Homepage hardcoded metrics | `apps/web/src/features/landing/LandingPageView.tsx:265-308` (read) |
| Prefilled demo creds | `apps/web/src/features/auth/AuthViews.tsx:9-10` (read) |
| Report 70-fallback | `apps/web/src/features/reports/ReportDetailView.tsx:28` (read) |
| Contrast ratios | Lua-independent WCAG relative-luminance computation (python3, this review) |
| Bundle size | `apps/web/dist/assets/index-CD1TK-gs.js` = 1,258,668 bytes (measured) |
| 375px breakpoints | `apps/web/src/styles.css` — no `@media` below 1024px/768px (read) |
| Backend routes / capabilities | `apps/api/src/routes.ts`, `apps/api/src/controllers/public/*` (read) |
| Revenue endpoint existence | `apps/api/src/routes.ts:1374` `getRevenueScenarios` (confirmed present, but NOT wired to homepage) |
| Watchdog alerts / ack | `apps/api/src/routes.ts:834-850` (confirmed) |
| White-label / agency | `apps/api/src/routes.ts:1900` `whiteLabelService`, `apps/web/src/features/agency/ClientViews.tsx` (confirmed) |

---

## 3. Product Model Challenge — "Five Pillars" vs. Reality

**Finding (STRUCTURAL).** The blueprint's own §1 defines **five** "Core Pillars," but the shipped scoring engine implements **four** scored pillars. The "overall" score in `scoring.ts:423` is a weighted blend of exactly four categories:

```
overall = round(lead*0.35 + advertising*0.25 + seo*0.20 + security*0.20)
```

The five "strategic" pillars (Diagnostic Engine / Lead Leakage / Revenue Intelligence / Watchdog / Agency) are **not** scoring dimensions — they are product modules. Two of them ("Revenue Intelligence" and "Continuous Watchdog") have **no score and never will**; they are features, not metrics. Framing them as co-equal "pillars" with the four scored ones creates a false mental model for the reader.

**Verdict.** The blueprint title "The Five Pillars" (read literally) is misleading. The reviewer accepts a *marketing* notion of five pillars, but the document must explicitly separate:
- **4 Scored Pillars** (LEAD / ADVERTISING / SEO / SECURITY) — authoritative, computed, rendered.
- **5 Product Modules** (Diagnostic / Lead Leakage / Revenue Intelligence / Watchdog / Agency) — the roadmap vehicle.

**Decision**: **MODIFY §1** to use "Four Scored Pillars + Five Product Modules," and add a one-line cross-reference showing which module maps to which scored pillar.

---

## 4. Homepage Architecture & Proof Strategy (Blueprint §4)

**Strengths (KEEP):**
- Adopting **Strategy C — labeled interactive simulation** for the fake dashboard is the correct trust fix. The current homepage preview at `LandingPageView.tsx:265-308` is a **static, hardcoded mock framed as a live app** (`app.leadguard.io/dashboard — Executive Revenue Intelligence`, `₹3,42,000 across 14 websites`, `94/100`, `24/24`, `GA4 + Meta`) with **no demo/sample label anywhere in the visible DOM**. This is a genuine P1 credibility risk and Strategy C resolves it. (§4 verification: `UNSUPPORTED`-as-provenance, but the *fix* is `SUPPORTED`.)
- Micro-proof badges ("Zero Firebase • SSRF-Hardened • 100% Free Analysis") are accurate vs. the SSRF/private-address guards confirmed in `routes.ts:2026`.

**Red-team challenges / MODIFY:**
- **Site-level revenue bucket is not backed by any live dashboard aggregate.** The `revenue-scenarios` endpoint (`GET .../revenue-scenarios`, `routes.ts:1374`) is **per-audit** and consumed only by `useIntelligence.ts` inside an audit context — there is **no homepage→revenue aggregation endpoint**. The blueprint's hero "Recovered Revenue Value" figures must therefore be **mock-only and labeled**, never presented as live tenant aggregates. The blueprint's Strategy C already implies this; make it an explicit rule: **no homepage number may claim to be a live read of tenant data**.
- **Pseudo-real scores in the mock (`84/100`, `68/100`, `-25 pts`) must not collide with the weighted 35/25/20/20 formula** the real engine uses. Mock fixtures should be generated by **calling the real `calculateScores`/`calculateConversionRisk` on the mock finding set**, so the demo visually matches real output semantics. This is a cheap, high-fidelity win (KEEP, narrowed).

**Decision**: KEEP Strategy C; MODIFY to (a) label all hero numbers as example data and (b) generate mock scores via the real scoring functions.

---

## 5. Free Scan & Diagnostic Engine Lifecycle — 12-State Matrix (Blueprint §5)

**Backend support check (SUPPORTED):**
- `POST /public/express-fix/free-scan`, `GET /public/express-fix/scan/:scanId`, `GET /public/express-fix/scan/:scanId/status` all exist (`guestScanController.ts:13,45,73`). The Idle → Submitting → Queued → Scanning → Completed spine is **fully backed**.
- Rate limiting (State 7) is backed: public route uses a hardened limiter and the `RATE_LIMITER_UNAVAILABLE` fail-closed path (`rateLimiters.ts`, uncommitted Phase 1.2 change).

**Red-team challenges / MODIFY:**
- **State 11 "Scan Expired (>24 hours)" and State 12 "Result Unavailable"** imply a TTL/cleanup on guest scans. Confirm there is an expiration policy and a `404` mapping — the doc should state the actual TTL value. If guest scans are retained indefinitely, State 11's copy is false. **Verify guest-scan retention** before shipping that banner.
- **State 5 "streaming findings"** implies partial-result streaming. Current API returns the finished job only; there is no SSE/partial-findings stream. **Mark State 5 `UNSUPPORTED`** unless a streaming worker channel is added.
- The diagram shows **3 scans/hr** public limit with a cooldown timer. Confirm the actual configured limit matches 3/hr; the doc must quote the real value, not an illustrative one.

**Decision**: KEEP the 12-state model as UX scaffolding; **MODIFY** copy for State 11 to match real retention, and tag State 5 as `UNSUPPORTED` (defer real streaming).

---

## 6. Scan Result & Audit Dossier Progressive Disclosure (Blueprint §6)

**Backend support check (mostly SUPPORTED).**
- The result page already renders the **4 real scored pillars** (`ScanResultView.tsx:15-20`: lead/advertising/seo/security) with overall + per-pillar + top findings + score impact. Good alignment.
- Executive-impact layer (Level 1) is feasible: `calculateConversionRisk`/`buildBusinessImpact` (`business-impact.ts`) already produce opportunity-loss, confidence, and assumptions — exactly the "₹42,000/mo at risk [Moderate Confidence]" card. **KEEP**, and drive it from `buildBusinessImpact`, not hardcoded values.

**Red-team challenges / MODIFY:**
- **Pillar naming mismatch on the result page.** The blueprint's Level-1 gauge lists "Lead Capture / Advertising / SEO / Sec" while the engine and the actual `ScanResultView` use `lead / advertising / seo / security`. The blueprint's homepage instead lists "Form / Ads / WhatsApp / Watchdog" (§4 Pillar 1–4). **Three inconsistent pillar taxonomies.** Standardize UI labels to exactly: **Lead, Advertising, SEO, Security** (matching `scoring.ts` categories) everywhere. (§3 + §4 + §6 cross-cutting fix.)
- **Level 3 tabs: `[Findings] [Scenarios] [Funnel] [WhatsApp]`.** `Scenarios` is backed (revenue-scenarios). **`Funnel` and a dedicated `WhatsApp` tab are `UNSUPPORTED`** as surfaced entities — there is a `getRevenueScenarios` but no funnel-dropoff visualization endpoint. Mark Funnel/WhatsApp tabs `UNSUPPORTED` (DEFER) or define the data source.
- **Rule IDs in evidence drawer.** The doc references `LG-002 (WhatsApp Format Validator)`. Current rules are `LG-001…LG-015` (`scoring.ts`); `LG-002` is not defined. Use the real `ruleId`/`normalizedIssueKey` from `SCORE_RULES_V3`.

**Decision**: KEEP Level 1 executive layer (drive from `buildBusinessImpact`); KEEP Level 2 ranked remediation (backed by `explainScores` top rules); **MODIFY** Level 3 to drop/tag `UNSUPPORTED` Funnel and WhatsApp tabs, fix the rule-ID example, and standardize pillar labels.

---

## 7. Executive Dashboard Architecture (Blueprint §7)

**Backend support check (SUPPORTED direction).** Dashboard KPI cards (Lead Health, Est. Loss, Critical Lept, Watchdog) map to real data: per-audit score, `buildBusinessImpact`, findings, and monitoring status — all present.

**Red-team challenges / MODIFY:**
- **"Est. Loss ₹35,000/mo — Medium Confidence"** is per-audit (`getRevenueScenarios`) and *not* a cross-site aggregate. The dashboard shows one active site, so this is fine **only if** labeled "for current site." Do not imply tenant-wide rolling revenue.
- **"Score Delta (+4 pts vs prev)"** requires comparing the latest audit against a prior audit. Confirm a score-history query exists; if not, this card is `UNSUPPORTED`. The audit-history table in §7 Section 4 ("Score Delta") has the same dependency.
- Watchdog stream ("Form check / Baseline OK / SSL renewed") should come from the real alert timeline (§8), not hardcoded examples.

**Decision**: KEEP dashboard structure (well-matched to real data); **MODIFY** to source Est. Loss from per-audit `buildBusinessImpact` with explicit scope label, and either back "Score Delta" with a real history query or mark it `UNSUPPORTED`.

---

## 8. Continuous Watchdog & Retention Monitoring UX (Blueprint §8)

**Backend support check (SUPPORTED lifecycle).** Incidents are real: `GET /monitoring/:id/alerts` and `POST /monitoring/:id/alerts/:alertId/ack` (`routes.ts:834-850`), with `alertPolicy` config. The STABLE / INCIDENT_OPEN → ACKNOWLEDGED → RESOLVED lifecycle maps to these endpoints.

**Red-team challenges / MODIFY:**
- **"RESOLVED upon next successful crawl"** is a state the current API signals indirectly (new alert vs. acked?). Confirm `monitoringService` recomputes state on crawl; if resolution is only inferred, state it explicitly in docs.
- **Monitor List columns** (`REGRESSION_DETECTED`, incident count) need an endpoint returning per-monitor status + incident count. Verify a list field exposes `status` and `incidentCount`; if not, this table is `UNSUPPORTED`.
- Baseline **DOM diff comparison tool** (Monitor Detail) is **not exposed by current API** — diffing is internal. The *visualized diff* view is `UNSUPPORTED` (DEFER).

**Decision**: KEEP the incident ack lifecycle (backed); **MODIFY** to source the stream from `/alerts` and remove/ DEFER the baseline-DOM-diff visualization unless a diff endpoint is added.

---

## 9. Report Generation & Cryptographic Sharing UX (Blueprint §9)

**Backend support check — MIXED.**
- **Immutable versioning** via frozen `ReportVersion` snapshot in Postgres and the **asynchronous PDF worker** are architectural claims. Verify these tables/workers exist; if not, `UNSUPPORTED`.
- **Cryptographic share links `/public/reports/:token`** with SHA-256 token, **password protection, expiration, access logs**: the public report API currently exposes only `GET /reports/` and `GET /reports/:id`, both gated by `REPORT_READ` **API-key scope** (`publicReportController.ts:8,31`). There is **no token-bearing public share endpoint, no password, no expiry, no access log**. The entire §9 "Cryptographic share link" system is **`UNSUPPORTED`** at the current API layer.

**Red-team challenge.** This is the highest-risk net-new feature in the roadmap (auth-boundary, revocation, secret hygiene). It is correctly placed relatively low (roadmap #14, complexity Low — a **misclassification**: auth+revocation+expiry+audit is not "Low"). 

**Decision**: **DEFER** §9 share links to a dedicated phase with security review. **MODIFY** the roadmap complexity for #14 from Low to Medium/High. Keep "report versioning/PDF export" only if the schema already supports it.

---

## 10. Agency Growth Suite Architecture (Blueprint §10)

**Backend support check — MIXED/UNSUPPORTED.**
- **Multi-tenant client workspaces** (`/agency/clients`) exist (`ClientViews.tsx`) and create isolated client workspaces. **KEEP.**
- **White-label reports** are partially backed: `whiteLabelService.resolveBranding` + `generateBrandedHtml` (`routes.ts:1900-1912`) cover branded/export HTML. **KEEP** the white-label *report* angle; scope narrowly to what `whiteLabelService` supports.
- **Client workspace domain assignment picker** (#11) — assigning tracked sites to a client workspace: verify the workspace–website relationship endpoint. Likely present (workspace has websites); if so KEEP (Low).
- **500-SITE PROSPECT HUNTER (#12, batch CSV + autonomous batch crawl + filtered by Lead Score)** — **`UNSUPPORTED`**: no batch-audit job + filter API surfaced. High complexity. **DEFER.**
- **Grounded AI cold pitch generator (#13)** — depends on an LLM endpoint + grounding pipeline not visible in the public surface. **`UNSUPPORTED`. DEFER** (and note: "grounded in empirical scan findings" is a correctness/refusal gate to review separately).
- **Embeddable diagnostic widgets (#11/#3, whitelisted iframe widget)** — **`UNSUPPORTED`** at API surface.

**Decision**: KEEP client workspaces + white-label reports + domain-assignment picker. **DEFER** prospect hunter (High), AI pitch generator, and embeddable widgets until an API/LLM contract is defined.

---

## 11. Developer Platform Architecture (Blueprint §11)

**Backend support check (SUPPORTED core).** API keys already exist with scoped RBAC via `apiKeyService.requireScope('AUDIT_RUN'|'MONITORING_RUN'|'REPORT_READ'|...)` — see `publicAuditController.ts`, `publicMonitoringController.ts`, `publicReportController.ts`. This directly matches `lg_live_*`/`lg_test_*` scoped keys.

**Red-team challenges / MODIFY:**
- **Webhooks with HMAC-SHA256 signatures** (`X-LeadGuard-Signature`) and an event catalog (`audit.completed`, `monitoring.incident_opened`): verify a webhook outbox + signing exists. If only notification events exist without HMAC signing, mark the signature guarantee `UNSUPPORTED`.
- **Interactive OpenAPI 3.1 docs** — confirm a public OpenAPI route exists.

**Decision**: KEEP the API-key scoping story (verified). **MODIFY** to document only what the key system actually grants; mark webhook HMAC and OpenAPI docs `UNSUPPORTED` until verified.

---

## 12. Platform Administration (Blueprint §12)

**Backend support check (SUPPORTED direction).** Admin aggregate telemetry (MRR, queue lengths), user moderation, org management, and immutable admin audit logs are plausible but **not verified** here.

**Red-team challenge.** All five §12 items exceed the review's read scope but align with expected admin routes. Recommend each admin capability be verified against `routes.ts` before UI build, and mark **all of §12 as `TO-VERIFY`**, not `UNSUPPORTED` — none is user-facing and none blocks Phase 2A approval.

**Decision**: KEEP as roadmap intent; **DEFER** detailed UI until the admin API surface is confirmed.

---

## 13. Guest-to-Paid & Guest-to-Account Conversion (Blueprint §13)

**Backend support check (SUPPORTED).**
- **Path A (1-click remediation):** `POST /billing/checkout/express-fix` + `/verify` exist (`routes.ts:628,651`), Razorpay TEST mode is hardened (Phase 1.2, uncommitted). The `ExpressFixCheckoutView` collects guest email/name. **KEEP.**
- **Path B (registration linkage / scan migration):** the blueprint's "backend automatically migrates guest scan into user workspace" — **`UNSUPPORTED`**: there is no `register?scanId=...` link route that re-parents a guest scan into a new org. The blueprint **already provides the graceful fallback** (banner: "Your recent scan for [domain] is ready — Click to link"). Good defensive design: **MODIFY** to make the manual "link scan" the *primary* mechanism and the auto-migrate the enhancement, so the shipped behavior is honest even before auto-migration lands.

**Edge-case handling**: AdminAuditLog on migration failure aligns with §12's audit-log intent. **KEEP.**

**Decision**: KEEP Path A. KEEP Path B's fallback design; **MODIFY** to ship manual-link first, auto-migrate as an enhancement (roadmap #5 stays Medium but claims only the fallback as guaranteed behavior).

---

## 14. Responsive Viewport Strategy (Blueprint §14)

**Backend support check: N/A (CSS). Current source: `styles.css` has NO media query below 768px** (only `@media (max-width: 1024px)` and `(max-width: 768px)`). The audit independently live-verified 375px horizontal overflow at `375x812` (P1). So the blueprint's 375px fix is **verified-needed**.

**Red-team challenge / MODIFY:**
- The fix ("replace fixed widths with `minmax(0,1fr)` + `flex-wrap`, plus `overflow-x:hidden`") is sound **and cheap (roadmap #2, Low)**. **KEEP.**
- Widen the fix: the real risk is the `#pricing` grid and header. The blueprint names `.pricingGrid`/`.topbarActions` but current styles use classes like `.pricing-grid`/`.topbar`; align the selector names to actual classes during implementation.
- Add an explicit `@media (max-width: 480px)` layer rather than relying on generic `min-width` guards; and add a CI/Playwright regression at `375px` (aligns with the audit's live-browser verification).

**Decision**: KEEP with implementation-name alignment + a 375px regression check.

---

## 15. Accessibility Architecture (Blueprint §15 + Design System contrast claims)

**Finding (STRUCTURAL — numeric errors + a real AA failure).** The documented contrast numbers are wrong, and the real failures are omitted. Measured WCAG relative-luminance contrast for the shipped tokens:

| Token pair | Blueprint-claimed | Measured (this review) | WCAG AA(4.5:1) normal text |
| :--- | :---: | :---: | :--- |
| `#f8fafc` on `#090d16` (primary text) | **14.2:1** (AAA) | **18.57:1** | ✅ PASS (AAA) |
| `#f8fafc` on `#111726` | – | 17.09:1 | ✅ PASS |
| `#94a3b8` on `#111726` (secondary) | **5.1:1** (AA) | **6.97:1** | ✅ PASS |
| `#64748b` on `#111726` (**`--text-muted`**) | *not assessed* | **3.76:1** | ❌ **FAIL** (large-text 3:1 also marginal) |
| `#8b5cf6` on `#111726` (**`--purple`**) | *not assessed* | **4.22:1** | ❌ **FAIL for small text** |

- The **"14.2:1" and "5.1:1" figures are unsupported/incorrect** (they understate the passes — the pairs actually pass by a wide margin, so the *conclusion* "exceeds AAA/AA" is correct, but the numbers must be corrected).
- The doc **misses the tokens that actually fail AA**: `--text-muted` (timestamps, table headers, helper hints, card subtext — small normal text at `12–14px` throughout `LandingPageView`, `ScanResultView`, `styles.css`) = **3.76:1**, and `--purple` = 4.22:1. **This is the real accessibility work**, and the blueprint does not schedule any fix for it.

**Recommendations (MODIFY §15):**
1. Correct numbers: `18.57:1` and `6.97:1` (or recompute against the actual surfaces used).
2. Add a **muted-text remediation**: bump `--text-muted` to a value ≥4.5:1 on `#111726` (e.g. `#9ca3af` ≈ 6.9:1, or `#a3aab8`) or restrict `--text-muted` to labels ≥18px / non-informative decorative text.
3. Raise `--purple` (`#8b5cf6` → e.g. `#a78bfa`) or reserve purple for decorative/optional elements only.
4. Add a programmatic contrast gate (Lighthouse/axe per-PR or CI) so future tokens cannot regress below AA — currently there is no such gate.

**Decision**: **MODIFY §15 materially** — correct the numbers, add muted/purple remediation, add a contrast gate. This is the blueprint's single biggest accuracy gap and the only real accessibility omission.

---

## 16. Frontend Performance Architecture & Code Splitting (Blueprint §16)

**Verification (SUPPORTED).** `apps/web/dist/assets/index-CD1TK-gs.js` = **1,258,668 bytes** ≈ **1.25 MB**, a single un-split chunk. The blueprint's **"1,258 kB → <180 kB"** narrative is **supported** as a measured baseline; the target `<180 kB` is a credible code-splitting objective.

**Red-team challenge / MODIFY:**
- The target split sizes (§16 diagram) are **estimates, not contracts**. Confirm **no gzip-vs-raw conflation**: `1,258 kB` raw ≈ ~300 kB gzip. "Reduce to <180 kB" must be stated **per metric** (raw vs. gzip) to avoid disappointing marketing numbers.
- Precursor risk: many route bundles depend on the design-system chunk; **design-token standardization (#1) and code-splitting (#3) must be ordered together** (tokens first) so the shared chunk can actually be deduplicated. The roadmap already orders them correctly (#1 before #3) — **KEEP ordering**.
- Add a **bundle-size CI gate** so the <180 kB target is enforced, matching the contrast gate in §15.

**Decision**: KEEP #3 (code splitting) as a verified-value, top-3 roadmap item. **MODIFY** to state sizes per raw/gzip metric and add a bundle CI gate.

---

## 17. State Model Review — Consistency Across Pages

The 12-state scan matrix (§5) is internally coherent and maps well to the guest-scan routes. Two gaps:
- **No explicit "partial/degraded crawl" state** between Scanning and Completed (the worker may finish with fewer pages than targeted) — the blueprint's State 5 "Partial Progress" is about *live discovery*, not *degraded completion*. Consider an explicit "completed with limitations" badge when a crawl is truncated (matches the `HOST_TIMEOUT`/403 handling already in `routes.ts:2026`).
- **State 11/12 copy depends on retention policy that isn't verified** (see §5).

**Decision**: KEEP matrix; **MODIFY** to add a "completed with limitations" terminal state and bind §5 states 11–12 to the actual retention TTL.

---

## 18. Backend-Contract Alignment Summary (Categories A–E)

| Cat | Blueprint ask | Real backend capability | Verdict |
| :-- | :--- | :--- | :--- |
| A | Free-scan funnel (homepage→scan→status) | `POST /free-scan`, `GET /scan/:id`, `GET /scan/:id/status` | ✅ KEEP |
| A | Result page 4 pillars + impact | `score.lead/advertising/seo/security` + `buildBusinessImpact` | ✅ KEEP |
| B | Express-Fix remediation + Razorpay TEST | `POST/verify` + hardened TEST reconcile (Phase 1.2) | ✅ KEEP |
| B | Guest scan → account auto-migration | **No link route** — only manual fallback viable | ⚠️ MODIFY (manual-first) |
| C | Watchdog incident ack lifecycle | `GET /monitoring/:id/alerts`, `POST .../ack` | ✅ KEEP |
| C | Baseline DOM-diff visualization | Not exposed | ⛔ UNSUPPORTED (DEFER) |
| D | Cryptographic share links (token/password/expiry/revoke/logs) | Only API-key `REPORT_READ` reads; no token share layer | ⛔ UNSUPPORTED (DEFER) |
| E | Agency workspaces + white-label | `ClientViews` + `whiteLabelService` | ✅ KEEP |
| E | Batch prospect hunter / AI pitch / widgets | Not surfaced | ⛔ UNSUPPORTED (DEFER) |

---

## 19. Fake-Data Trust Risk — Inventory & Disposition

| Surface | Current state (verified) | Blueprint disposition | Verdict |
| :--- | :--- | :--- | :--- |
| Homepage hero preview | **Hardcoded** `₹3,42,000 / 94 / 24 / GA4+Meta`, framed as live app, **no demo label** | Strategy C labeled simulation | ✅ KEEP (fix) |
| Login view | **Prefilled** `demo@leadguard.test` / `SecurePass1234!` (`AuthViews.tsx:9-10`) | *not addressed* | ⚠️ **ADD**: gate behind local dev only; never ship in prod builds |
| Report detail | **Fallback** `score = {overall:70,...}` on missing snapshot (`ReportDetailView.tsx:28`) | *not addressed* | ⚠️ **ADD**: if snapshot missing, show empty/NA state — a silent fake 70 is a trust leak |
| Express-Fix price/currency | Backend-authoritative `299900` paise / INR (Phase 1.2, uncommitted) | aligns | ✅ KEEP |

**Red-team addition:** the blueprint fixes the homepage but **silently leaves two other fake-data leaks** (login demo creds in the shipped DOM, and the report 70-fallback). Both must be gated/removed before public launch.

---

## 20. Phased Recommendation Classification — Industry Benchmarks

- **Revenue-scenario slider** (roadmap #8): defers to per-audit `getRevenueScenarios`; benchmark parity (typical audit-tool ROI calculators) — **KEEP**, scope to current site, label as estimate (defensible vs. SEBI/consumer-protection norms on "guaranteed revenue" claims).
- **Score-ring / finding-card refactor** (#6): pure frontend, low risk — **KEEP**.
- **Executive dashboard decision framework** (#7) and **audit-dossier disclosure refactor** (#9): both well-backed, no new data contracts — **KEEP**, but see §6/§7 caveats.
- **Nothing below 4.5:1 passes** — the only true regulatory exposure is visual trust + contrast, both addressed above.

---

## 21. PHASE 2A FINAL APPROVAL BLUEPRINT

**Approved as-is (KEEP):**
1. Design tokens standardization (#1)
2. Mobile 375px layout fix (#2)
3. Route-level code splitting (#3) — with raw/gzip + CI gate
4. Landing page demo banner + labeled interactive simulation (#4)
6. ScoreRing/FindingCard canonicalization (#6)
7. Executive dashboard decision framework (#7)
8. Revenue scenario simulator (#8)
10. Watchdog incident lifecycle UI (#10) — source from `/alerts`, DEFER DOM-diff viz
11. Client workspace domain assignment picker (#11)

**Approved with required MODIFY:**
5. Guest-scan → registration linkage (#5): **manual-link-first**, auto-migrate as enhancement
14. Cryptographic share links (#14): **DEFER** to a dedicated security-reviewed phase (reclassify to Medium/High); the rest of §9 (versioning/PDF) only if schema-backed
9. Audit-dossier refactor (#9): drop `UNSUPPORTED` Funnel/WhatsApp tabs, fix rule-ID example, standardize pillar labels
- **§1 product model**: present "4 Scored Pillars + 5 Product Modules"
- **§15 accessibility**: correct contrast numbers, add muted/purple AA remediation + contrast gate

**Deferred (DEFER) — net-new, unbacked, high-risk:**
12. Prospect hunter batch flow (High, needs batch-audit API)
13. Grounded AI cold pitch generator (needs LLM + grounding + refusal contract)
- Embeddable diagnostic widgets (needs iframe/whitelist service)
- Baseline DOM-diff visualization

**Added (not in original roadmap):**
- Gate login demo creds to non-prod
- Replace silent report 70-fallback with explicit NA state
- Add CI contrast gate + CI bundle-size gate + 375px regression check

---

## 22. Phase 2A Scorecard (0–10; scores <8 explained)

| Category | Score | Rationale |
| :--- | :---: | :--- |
| Product model & pillar framing | **4** | Three conflicting pillar taxonomies; the single structural defect. Fix via §21 MODIFY. |
| Homepage & conversion funnel | **8** | Correct Strategy C; but hero revenue is not live-tenant-backed and must stay labeled/mock. |
| Scan result progressive disclosure | **8** | Mostly source-backed (4 pillars + impact); Level-3 tabs overreach. |
| Dashboard decision framework | **8** | Well-matched to real data; per-site scope + score-delta need verification. |
| Audit detail / dossier | **8** | Sound 3-tier refactor; drop unbacked tabs. |
| Watchdog UX | **7** | Acknowledgment lifecycle backed; DOM-diff viz unbacked (must defer). |
| Agency platform | **6** | Workspaces + white-label real; prospect/AI/widget largely aspirational (defer). |
| Design system & tokens | **7** | Token set is clean, but contrast claims wrong + real muted/purple AA failures omitted. |
| Component architecture | **8** | Components map cleanly to real features; pending ScoreRing/FindingCard refactor. |
| Scan state model | **7** | Coherent 12-state, but States 5/11/12 conflict with real capabilities/retention. |
| Responsive | **7** | Verified 375px bug + sound fix; needs sub-768 layer + regression test. |
| Accessibility | **4** | Wrong numbers + unaddressed AA failures are the second structural defect. |
| Performance | **9** | 1.25 MB baseline measured; <180 kB target credible with CI gate. |
| Backend-contract alignment | **7** | Core funnel/impact/incident/agency backed; share-link layer + several agency items unbacked. |
| Fake-data trust risk | **5** | Fixes homepage but misses login creds + silent 70-fallback. |
| Industry benchmarking | **8** | Scenarios/estimates credible; no overclaiming of guaranteed revenue. |

**Overall Phase 2A readiness: 7.0 / 10 — CONDITIONAL APPROVAL.**

Approve Phase 2A for build **contingent on** closing the two structural defects (pillar framing, §21; accessibility contrast, §21), adding the three CI gates, and gating the two remaining fake-data leaks. With those MODIFYs merged, the blueprint is implementation-ready.

---

## 23. Open Items Handed Back (Verification TODO before build)

1. Confirm guest-scan **retention TTL** (drives §5 States 11–12 copy).
2. Confirm whether a **score-history / score-delta** query exists (drives §7 KPI "Score Delta" + audit trend table).
3. Verify **webhook HMAC signing** and **developer OpenAPI** routes exist (§11).
4. Verify **`ReportVersion` snapshot table** + **PDF worker** exist (§9) before importing section.
5. Confirm public rate-limit value is actually **3 scans/hr** (§5); the hardened limiter (Phase 1.2) should expose a single source of truth.

---

## 24. Reviewer Sign-off

This review covered the Phase 2A blueprint and design system against the shipped source and measured runtime. No product code was modified. The single deliverable of this phase is this document. Product changes enter scope only after user approval of the §21 final blueprint (or any selected subset).
