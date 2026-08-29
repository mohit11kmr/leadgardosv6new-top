# LeadGuard OS V6 — Final Master UX Specification & Approval Lock (Phase 2C)

**Document Version**: 6.0.0-final-master-spec  
**Date**: 2026-08-30  
**Status**: Authoritative Frontend Specification (Locked for Phase 3 Implementation)  
**Supersedes**: `PHASE_2A_PRODUCT_UX_BLUEPRINT.md` (Updated & Corrected via `PHASE_2B_RED_TEAM_REVIEW.md`)  
**Base Commit Verified**: `1cc0d8c3f4a1c0133825de88c013a1298ef4ea14`

---

## 1. Executive Product Model & Pillar Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LEADGUARD OS V6 CORE ARCHITECTURE                     │
│                                                                             │
│  4 SCORED PILLARS (The Diagnostic Engine)                                  │
│  ├── 1. Lead Capture .................... 35% Weight (Forms, Tel, WhatsApp) │
│  ├── 2. Advertising & Attribution ....... 25% Weight (Pixels, Tags, UTMs)   │
│  ├── 3. SEO & Metadata Hygiene .......... 20% Weight (Meta, Robots, Viewport)│
│  └── 4. Security & TLS .................. 20% Weight (HTTPS, Headers, CSP)  │
│                                                                             │
│  OVERALL SCORE FORMULA:                                                     │
│  overall = round(lead*0.35 + advertising*0.25 + seo*0.20 + security*0.20)   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  5 STRATEGIC PRODUCT MODULES (The Commercial Platform)                      │
│  ├── Module 1: Website Diagnostic Engine . Maps to all 4 Scored Pillars     │
│  ├── Module 2: Lead Leakage Detection .... Maps to Lead Capture + Ads       │
│  ├── Module 3: Revenue Intelligence ...... Quantifies Lost Opportunity Cost │
│  ├── Module 4: Continuous Watchdog ....... 24/7 Monitoring & Regressions    │
│  └── Module 5: Agency Operating Platform . Workspaces & Branded Reports     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Module-to-Pillar Mapping:

| Product Module | Relevant Scored Pillar(s) | Primary User Outcome | Data Source in Source Code |
| :--- | :--- | :--- | :--- |
| **1. Website Diagnostic Engine** | Lead, Advertising, SEO, Security | Authoritative, reproducible technical evaluation of entire site health. | `packages/shared/src/scoring.ts` (`calculateScores`) |
| **2. Lead Leakage Detection** | Lead Capture (35%), Advertising (25%) | Discovers broken contact mechanisms, dead form POSTs, and un-attributed ad spend. | `packages/shared/src/scanners/` (forms, tel, whatsapp, tracking) |
| **3. Revenue Intelligence** | Derived from Findings + User Traffic | Quantifies financial opportunity loss in currency (INR) with confidence ratings. | `packages/shared/src/business-impact.ts` (`calculateConversionRisk`) |
| **4. Continuous Watchdog** | All 4 Pillars tracked over time | Prevents regression after deployments; alerts team before leads are lost. | `apps/worker/src/monitoring/`, `routes.ts:834` (`/alerts`) |
| **5. Agency Operating Platform** | Workspaces & Branded Output | Enables agencies to manage client sites and deliver white-labeled reports. | `apps/api/src/services/agency/`, `ClientViews.tsx` |

---

## 2. Master Canonical Terminology Dictionary

All frontend screens, components, API clients, and documentation MUST strictly use this canonical terminology. Alternative terms are prohibited.

| Canonical Term | Allowed Usage | Prohibited Synonyms / Anti-Patterns | Meaning & Semantics |
| :--- | :--- | :--- | :--- |
| **Lead** | Scored Pillar (35%) | ❌ *Lead Gen, Conversion Pillar* | Functional inbound capture mechanisms (forms, `tel:`, `wa.me`). |
| **Advertising** | Scored Pillar (25%) | ❌ *Ad Readiness, Tracking Pillar* | Attribution tags, Meta Pixel, Google Tag Manager, analytics. |
| **SEO** | Scored Pillar (20%) | ❌ *Search Engine Optimization, Meta* | Search visibility hygiene affecting inbound traffic (meta, canonical). |
| **Security** | Scored Pillar (20%) | ❌ *TLS, Infrastructure, Safety* | Transport layer security, HTTPS certificate, HTTP security headers. |
| **Finding** | Diagnostic Defect | ❌ *Bug, Error, Leak, Vulnerability* | A discrete rule violation discovered during a crawl. |
| **Severity** | Finding Urgency | ❌ *Danger level, Impact tier* | `CRITICAL` (Red), `HIGH` (Amber), `MEDIUM` (Blue), `LOW`/`INFO` (Gray). |
| **Opportunity Loss** | Revenue Risk Metric | ❌ *Lost Revenue, Guaranteed Loss* | Mathematical estimation of prospective revenue at risk (`₹/mo`). |
| **Confidence** | Metric Reliability | ❌ *Accuracy, Trust score* | `HIGH` (Observed tags), `MEDIUM` (Derived), `ESTIMATED` (Assumed). |
| **Audit** | Point-in-time Crawl | ❌ *Scan (except free public scan)* | An immutable comprehensive technical evaluation of a domain. |
| **Monitor** | 24/7 Watchdog Entity | ❌ *Uptime check, Ping, Tracker* | A scheduled recurring crawler instance (e.g. 15m, 1h, 24h). |
| **Incident** | Watchdog Alert | ❌ *Outage, Downtime, Alert* | A detected regression between consecutive watchdog runs. |
| **Report** | Immutable Snapshot | ❌ *Export, PDF download* | A versioned, formatted diagnostic deliverable. |
| **Workspace** | Tenant Organization | ❌ *Account, Team, Company* | A multi-tenant organizational boundary with users and websites. |

---

## 3. Final Homepage Architecture & Proof Strategy

The homepage prioritizes an **evidence-driven interactive diagnostic experience** over decorative marketing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. TOPBAR: Brand Logo | Trust Badges | Pricing | Sign In | [ Run Free Scan ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. HERO: "Find the lead leaks costing your business customers."             │
│    Sub: Instant diagnostic crawl of forms, WhatsApp, calls, & tracking      │
│    [ INPUT: https://yourdomain.com ] [ BUTTON: Run Free Diagnostic Scan ]  │
│    Proof: "✓ Zero Firebase • ✓ SSRF-Hardened • ✓ 100% Free Analysis"       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. LABELED INTERACTIVE DEMO SIMULATION (Fixes P1 Fake Data Risk)            │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ 🏷️ [ Sample Diagnostic Report — Illustrative Example — Demo Mode ]   │ │
│    │ - Overall Health Ring: 78/100 (Computed via real 35/25/20/20 weights)│ │
│    │ - 4 Scored Pillars: Lead (65) | Ads (75) | SEO (90) | Security (85)  │ │
│    │ - Discovered Leaks: Broken WhatsApp Link (-25 pts), Missing Pixel    │ │
│    │ - Disclaimer: "Generated using standard LeadGuard diagnostic engine" │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. THE 4 SCORED PILLARS (How Diagnostic Scoring Works)                      │
│    - Lead Capture (35%): Form action destinations, phone & WhatsApp syntax  │
│    - Advertising & Tracking (25%): Meta Pixel, GA4, GTM, attribution tags   │
│    - SEO & Search Hygiene (20%): Viewport, canonicals, robots, meta tags    │
│    - Security & TLS (20%): HTTPS enforcement, HSTS, CSP, X-Frame-Options    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. REVENUE OPPORTUNITY LOSS SIMULATOR (Transparent Formula)                 │
│    [ Sliders: Monthly Visitors (10k) × Conv Rate (2%) × Lead Value (₹5,000) ]│
│    Output: ₹50,000 / mo Opportunity Loss at Risk                            │
│    Disclaimer: "Calculated based on user-supplied traffic and lead values"  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. TRANSPARENT COMMERCIAL TIERS (Directly bound to /billing/plans)          │
│    - Free Tier (₹0) • Pro (₹2,900/mo) • Agency (₹7,900/mo) • Express (₹2,999)│
├─────────────────────────────────────────────────────────────────────────────┤
│ 7. FOOTER: Navigation Links | Compliance | Privacy | Security Disclaimers  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Trust & Proof Lock:
- **No Unlabelled Hero Metrics**: The homepage preview MUST carry a persistent badge: `[Sample Diagnostic Report — Illustrative Example — Not Live Customer Data]`.
- **Score Semantics**: Demo score examples MUST be computed using the real `calculateScores` function from `packages/shared/src/scoring.ts` to ensure consistency.

---

## 4. Final Free-Scan Funnel & State Architecture

```
[HOMEPAGE URL INPUT] ──(Submit)──> [STATE: SUBMITTING]
                                           │
                                ┌──────────┴──────────┐
                                ▼                     ▼
                       (Validation Error)      (Valid URL -> API)
                                │                     │
                       [STATE: INVALID URL]   [STATE: QUEUED]
                                                      │
                                                      ▼
                                             [STATE: SCANNING]
                                          (Polling /status every 2s)
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
              [STATE: COMPLETED]            [STATE: RATE LIMITED]           [STATE: ERROR / TIMEOUT]
              - Displays Score Dossier      - Shows Cooldown Timer          - Displays Friendly Fallback
              - CTAs: Express Fix or Save   - Explains 3 scans/hr limit     - Single-click Retry Action
```

### Detailed State Matrix:

| State | User View | User Understanding | Available Action |
| :--- | :--- | :--- | :--- |
| **1. Idle** | High-contrast input bar with placeholder `https://yourcompany.com`. | Ready to scan any public domain. | Type URL and submit. |
| **2. Submitting** | Input disabled; button shows spinner and *"Initializing scanner..."*. | Request in-flight to `POST /public/free-scan`. | Wait (200–500ms). |
| **3. Queued** | Navigated to `/scan/:scanId`; displays queue position badge. | Scan is registered in background queue. | Wait or bookmark. |
| **4. Scanning** | Polling `GET /public/scan/:scanId/status` every 2000ms with progress bar. | Active crawl in progress. | Wait (3–8s). |
| **5. Completed** | Full dossier rendered with Overall Score, 4 Pillars, Top 5 Findings. | Audit is finished and saved in database. | **"Fix My Leaks (₹2,999)"** or **"Save Audit"**. |
| **6. Completed w/ Limits**| Dossier with warning chip: *"Partial crawl completed (subpages timed out)"*. | Target site firewalled or delayed deep links. | Inspect available findings. |
| **7. Rate Limited** | Alert card: *"Public rate limit reached (3 scans/hour per IP)"*. | Prevents crawler denial-of-service. | Sign in for unlimited audits. |
| **8. Invalid URL** | Inline error: *"Please enter a valid HTTP/HTTPS domain"*. | Format validation caught before API request. | Correct URL. |
| **9. Server Unavailable** | Alert banner: *"Scan engine temporarily busy. Please retry in a moment."* | Backend fetch or Redis connection error. | Click **"Retry Scan"**. |
| **10. Scan Failed** | Error card: *"Target domain blocked connection or returned HTTP 403/504"*. | Target website is offline or firewalled. | Verify site accessibility. |

---

## 5. Final Scan Result Page Specification

The Scan Result page (`/scan/:scanId`) strictly categorizes all displayed information:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: ABOVE-THE-FOLD EXECUTIVE IMPACT                                    │
│ ┌──────────────────────┐ ┌────────────────────────────────────────────────┐ │
│ │  HEALTH SCORE RING   │ │  ESTIMATED OPPORTUNITY LOSS                    │ │
│ │      68 / 100        │ │  ₹42,000 / month at risk [Moderate Confidence] │ │
│ │  Needs Attention     │ │  Assumptions: 10k visits • 2% conv • ₹5k lead │ │
│ └──────────────────────┘ └────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  4 SCORED PILLARS (0–100)                                               │ │
│ │  Lead: 55/100 (35%) | Ads: 70/100 (25%) | SEO: 85/100 (20%) | Sec: 60/100│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: RANKED PRIORITY REMEDIATION ENGINE                                 │
│ [CRITICAL] Broken WhatsApp Link — Missing country code strips leads (-25 pts)│
│            Recommendation: Update href to `https://wa.me/919876543210`     │
│            [ Button: Copy Fix Snippet ] [ Button: Order Express Fix ]       │
│ [HIGH]     Missing Meta Pixel — Ad traffic un-attributed (-15 pts)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: DEEP DIAGNOSTIC FINDINGS & EVIDENCE                                │
│ Table of Discovered Findings with Severity, Rule ID, and Recommendation.    │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  EXPANDABLE TECHNICAL EVIDENCE DRAWER                                   │ │
│ │  - Target DOM Element: `<a href="whatsapp://send?phone=">`              │ │
│ │  - Scanner Rule ID: LG-001 (WhatsApp Format Validator)                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Categorization Standard:
- **`OBSERVED`**: Exact raw DOM snippets, HTTP status codes, missing tags, header presence.
- **`CALCULATED`**: Overall Score and 4 Pillar Scores derived from rule point deductions.
- **`ESTIMATED`**: Financial opportunity loss derived from `buildBusinessImpact`.
- **`USER-ASSUMED`**: Baseline monthly traffic (10k), conversion rate (2%), and lead value (₹5,000) adjustable via simulator sliders.

---

## 6. Final Audit Dossier Specification

The Audit Dossier (`/audits/:id`) reorganizes the 8 deep audit sub-capabilities into an intuitive progressive hierarchy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: EXECUTIVE SUMMARY (Always Visible Above-the-Fold)                  │
│ - Target Domain & Timestamp • Overall Score (0-100) • 4 Pillar Gauges       │
│ - Opportunity Loss Card with Confidence Rating • Top 3 Critical Blockers   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: RANKED FINDINGS & TECHNICAL EVIDENCE (Primary Default View)        │
│ - Filterable list of findings by Severity (Critical, High, Medium, Low)    │
│ - Collapsible Evidence Drawer per finding with copyable remediation code   │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: REVENUE INTELLIGENCE & SENSITIVITY SIMULATOR (Secondary Tab)      │
│ - Interactive Traffic × Conversion Rate × Lead Value sensitivity sliders   │
│ - Grounded directly in per-audit `getRevenueScenarios` API                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 4: CRAWLED PAGES & DOMAIN TELEMETRY (Technical Subtab)                │
│ - List of crawled URLs, response times, SSL certificate expiry, HTTP headers│
└─────────────────────────────────────────────────────────────────────────────┘
```

### Feature Support Status Lock:
- **`SUPPORTED NOW`**: Overview, 4 Pillar Scores, Ranked Findings, Technical Evidence Drawers, Revenue Scenario Simulator, Crawled Pages List.
- **`DEFERRED / UNSUPPORTED`**: Standalone Funnel drop-off visualization and standalone WhatsApp optimizer tabs (both merged into the main findings and scenario views).

---

## 7. Final Executive Dashboard Specification

The dashboard (`/dashboard`) is the central operational command center for business owners and growth teams.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Active Website Switcher | Last Audit Timestamp | [ + Run New Audit ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 1: EXECUTIVE INTELLIGENCE SUMMARY                                   │
│ "acme.com has 2 critical lead leakage blockers causing ~₹35,000/mo risk."   │
│ [ Scope: Active Website acme.com ]                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 2: 4-COLUMN KPI GRID                                                │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐ │
│ │ Lead Health     │ │ Est. Loss / mo  │ │ Critical Leaks  │ │ Watchdog    │ │
│ │     72/100      │ │    ₹35,000      │ │   2 Blockers    │ │ 24/24 OK    │ │
│ │ Active Domain   │ │ Medium Conf     │ │ Immediate Action│ │ 100% Up    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 3: OPERATIONAL SPLIT (2fr / 1fr)                                    │
│ ┌──────────────────────────────────────────┐ ┌────────────────────────────┐ │
│ │ ⚡ PRIORITY REMEDIATION ENGINE           │ │ 📡 24/7 WATCHDOG STREAM    │ │
│ │ Top 3 Ranked Technical Fixes             │ │ Live Alerts from /alerts   │ │
│ │ 1. Fix Contact Form Action (-20 pts)     │ │ • Today 14:30: Form check  │ │
│ │ 2. Add Meta Pixel ID (-15 pts)           │ │ • Today 08:00: Baseline OK │ │
│ │ 3. Format Tel RFC-3966 link (-10 pts)    │ │ • Yesterday: SSL renewed   │ │
│ └──────────────────────────────────────────┘ └────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 4: HISTORICAL AUDITS TABLE                                          │
│ Date | Crawled Pages | Health Score | Critical Issues Count | Action        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Final Continuous Watchdog UX Specification

- **Alert Stream**: Sourced directly from `GET /monitoring/:id/alerts`.
- **Incident Lifecycle**:
  1. `OPEN` (Red): Regression detected between consecutive crawls.
  2. `ACKNOWLEDGED` (Amber): User clicked `POST /monitoring/:id/alerts/:alertId/ack`.
  3. `RESOLVED` (Green): Automatically resolved on next successful crawl without regression.
- **DEFERRED**: Real-time visual DOM-diff viewer (marked as deferred until a backend diffing endpoint is added).

---

## 9. Final Report UX Specification

- **Immutable Snapshots**: Reports created via `POST /reports` freeze the audit state in `ReportVersion`.
- **PDF Generation**: Asynchronous BullMQ background worker with loading state and download button.
- **DEFERRED**: Public cryptographic share links with password protection and expiring tokens (deferred to a dedicated security-reviewed backend release).

---

## 10. Final Agency Growth Suite Specification

- **SUPPORTED NOW**:
  - Client Workspaces (`/agency/clients`): Multi-tenant workspace isolation for client accounts.
  - Domain Assignment: Association of tracked domains with specific client workspaces.
  - White-Label Reports: Custom agency branding (logo, agency company name, primary brand color) via `whiteLabelService`.
- **DEFERRED / UNSUPPORTED**:
  - 500-Site autonomous prospect hunter batch infrastructure.
  - Grounded AI cold pitch generator.
  - Embeddable diagnostic lead capture widgets.

---

## 11. Final Developer & Admin Platform Specification

- **Developer Platform (`/developer`)**: Scoped API key management (`lg_live_*`, `lg_test_*`), HMAC-signed webhook registrations, interactive OpenAPI 3.1 Swagger documentation.
- **Platform Administration (`/admin`)**: Platform telemetry KPIs, User moderation & suspension, Organization quota overrides, Immutable administrative audit logs.

---

## 12. Final Commercial Billing & Monetization Specification

- **Express Fix**: Server-authoritative fixed price of **₹2,999** (299900 paise INR).
- **Subscription Plans**: Monthly Pro (₹2,900/mo) and Agency (₹7,900/mo) with Razorpay subscription checkout.
- **Entitlement Quotas**: Visual usage progress bars tracking active websites, audits, and monitors against tier limits.

---

## 13. Zero-Fake-Data & Security Policy

1. **Homepage Demo**: MUST be labeled with `[Sample Diagnostic Report — Illustrative Example — Demo Mode]`.
2. **Login Credentials**: Hardcoded test credentials (`demo@leadguard.test`) MUST NOT be present in production bundles.
3. **Report Score Fallback**: Remove hardcoded fallback score of 70. When report snapshot data is missing, display an explicit `N/A` or empty state.

---

## 14. Final Responsive Architecture (375px Mobile Fix)

- **375px Mobile Bug Fix**: Replace fixed pixel widths in navigation, header actions, and pricing grids with `flex-wrap: wrap` and `minmax(0, 1fr)`.
- **Enforce Root Viewport Bounds**: Add `overflow-x: hidden` and `max-width: 100vw` to the root application shell.
- **Mobile Touch Targets**: All action buttons and links maintain a minimum 44px × 44px clickable area.

---

## 15. Final Frontend Performance Architecture

- **Bundle Baseline**: Single un-split bundle of `1,258 kB` raw (~300 kB gzip).
- **Route-Level Code Splitting**: Wrap all route views in `React.lazy()` with `Suspense` fallbacks.
- **Target Performance Acceptance Criteria**:
  - Initial Vendor + Shell Chunk: **< 250 kB raw** (< 70 kB gzip).
  - Individual Route Chunks: **< 100 kB raw** (< 30 kB gzip).
  - Largest Contentful Paint (LCP): **< 2.0s** on standard 4G networks.

---

## 16. Final Phased Implementation Roadmap (Phases 3A – 3J)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 3 IMPLEMENTATION ROADMAP                          │
│                                                                             │
│  PHASE 3A: Design Tokens & Base Primitives (Standardize styles.css, tokens) │
│  PHASE 3B: Homepage & Conversion Funnel (375px fix, labeled demo preview)   │
│  PHASE 3C: Scan Result Experience (Progressive disclosure, 4 pillars, ROI)  │
│  PHASE 3D: Authenticated Dashboard (Decision framework, KPI grid, stream)   │
│  PHASE 3E: Audit Dossier Refactor (Ranked remediation, evidence drawers)   │
│  PHASE 3F: Watchdog Monitoring UI (Incident ack lifecycle, alert feed)      │
│  PHASE 3G: Reports & Branded PDF Flow (Snapshot viewer, white-labeling)    │
│  PHASE 3H: Agency Core Workspaces (Client grouping, domain assignment)      │
│  PHASE 3I: Developer, Admin & Billing (API keys, webhooks, plan quotas)     │
│  PHASE 3J: Hardening, Responsive & Performance (Code splitting, CI gates)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Final Approval & Disposition Matrix

| Feature / Recommendation | Status | Rationale |
| :--- | :---: | :--- |
| **Standardize Design Tokens** | **KEEP** | Essential for eliminating Tailwind leakage and ensuring consistency. |
| **375px Mobile Overflow Fix** | **KEEP** | Resolves verified P1 horizontal layout defect. |
| **Route-Level Code Splitting** | **KEEP** | Solves verified 1.25MB bundle size problem. |
| **Labeled Homepage Demo Simulation** | **KEEP** | Resolves P1 fake data trust risk. |
| **Manual Guest Scan Linkage** | **KEEP (MODIFY)**| Supported manual link upon registration; auto-migrate is deferred. |
| **Executive Dashboard Decision Framework** | **KEEP** | Aligns dashboard around high-leverage user actions. |
| **Revenue Scenario Simulator** | **KEEP** | Fully backed by per-audit `getRevenueScenarios` API. |
| **Watchdog Incident Acknowledgment** | **KEEP** | Fully backed by `/monitoring/:id/alerts` and `/ack` endpoints. |
| **Agency Client Workspaces** | **KEEP** | Fully backed by existing agency client services. |
| **500-Site Prospect Hunter** | **DEFER** | Unbacked by batch API; requires dedicated batch crawler pipeline. |
| **Grounded AI Pitch Generator** | **DEFER** | Requires LLM integration and refusal safety contracts. |
| **Embeddable Diagnostic Widgets** | **DEFER** | Requires public embed iframe routing and origin whitelisting. |
| **Baseline DOM-Diff Visualization** | **DEFER** | Diffing is currently internal to worker; no visual diff endpoint. |
| **Secure Token Public Share Links** | **DEFER** | Requires security-reviewed public token routing and expiry layer. |
