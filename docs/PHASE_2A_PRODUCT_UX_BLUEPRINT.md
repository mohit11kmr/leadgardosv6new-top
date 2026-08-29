# LeadGuard OS V6 — Master Product UX Blueprint (Phase 2A)

**Document Version**: 6.0.0-blueprint  
**Date**: 2026-08-29  
**Status**: Architecture & Specification Only (Zero Product Code Implementation)  
**Target Repository**: `mohit11kmr/leadgardosv6new-top`

---

## 1. Product Mission & UX Philosophy

LeadGuard OS V6 is the authoritative **Revenue Intelligence & Website Diagnostic Platform** engineered to discover and remediate the silent conversion defects, broken form actions, malformed communication links, tracking drop-offs, and security vulnerabilities costing businesses revenue.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CORE PRODUCT UX PRINCIPLE                             │
│                                                                             │
│    "Every screen must help the user answer a high-stakes question           │
│     and execute an unambiguous, high-leverage decision."                   │
│                                                                             │
│  USER ──> QUESTION ──> INFORMATION ──> DECISION ──> ACTION                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Five Pillars vs. Prohibited Anti-Patterns

| Core Pillar | What LeadGuard IS | What LeadGuard IS NOT (Prohibited) |
| :--- | :--- | :--- |
| **1. Website Diagnostic Engine** | Deep, deterministic technical crawl of forms, CTAs, tags, DNS, TLS, headers, and DOM handlers. | ❌ A generic cosmetic SEO checker or Lighthouse clone. |
| **2. Lead Leakage Detection** | Discovery of broken conversion infrastructure (`tel:` links, `wa.me` queries, dead endpoints, missing pixels). | ❌ A vague marketing score generator without payload evidence. |
| **3. Revenue Intelligence** | Mathematical opportunity loss quantification with explicit confidence ratings and transparent assumptions. | ❌ Guaranteed revenue predictions or hallucinatory financial claims. |
| **4. Continuous Watchdog** | 24/7 scheduled autonomous multi-page monitoring with baseline diffing and regression alerting. | ❌ A simple HTTP 200 uptime ping checker. |
| **5. Agency Operating Platform** | Multi-tenant client workspaces, 500-site prospect hunter, grounded cold pitch generator, embeddable widgets, competitor radar. | ❌ A generic white-label PDF exporter with dummy charts. |

---

## 2. User Personas & Mental Decision Models

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    USER PERSONA DECISION MATRIX                                  │
├───────────────────────┬──────────────────────────────────────────┬───────────────────────────────┤
│ Persona               │ Core Question Answered                   │ Primary High-Leverage Action  │
├───────────────────────┼──────────────────────────────────────────┼───────────────────────────────┤
│ 1. SMB Business Owner │ "Is my website silently losing leads?"   │ Order Express Fix or Register │
│ 2. Performance Buyer  │ "Are my paid ads losing attribution?"    │ Copy Fix Snippet for Meta/GTM │
│ 3. Agency Consultant  │ "Which prospect has high-loss leaks?"    │ Generate Grounded Pitch       │
│ 4. Full-Stack Dev     │ "Which exact DOM element/handler broke?" │ Inspect Technical Evidence    │
│ 5. System Admin       │ "Are platform crawlers & queues healthy?"│ Inspect Telemetry / Logs      │
└───────────────────────┴──────────────────────────────────────────┴───────────────────────────────┘
```

### Detailed Persona Specifications:

#### Persona 1: The SMB Founder / Operator (e.g., Clinic Owner, Legal Partner, E-commerce Founder)
- **Mental Model**: Time-constrained, non-technical, outcome-focused, skeptical of generic software scores.
- **Trigger**: Suspects paid traffic or organic visits are not converting into inquiries/phone calls.
- **Question**: *"Is something broken on my website right now that is stopping customers from contacting me?"*
- **Required Information**: Clear 0–100 Health score, count of critical blockers, plain-English explanation of why it matters, estimated monthly financial loss.
- **Decision**: *"Do I need my developer to fix this immediately, or can I pay LeadGuard for a 1-click Express Fix?"*
- **Primary Action**: Click **"Fix My Lead Leaks — ₹2,999"** or create a free workspace to monitor the site 24/7.

#### Persona 2: The Growth Marketer / Performance Media Buyer
- **Mental Model**: ROI-focused, obsessed with conversion rate optimization (CRO) and attribution accuracy.
- **Trigger**: Cost-per-acquisition (CPA) spikes after a recent landing page or campaign deployment.
- **Question**: *"Did a theme change strip my Google Tag Manager, Meta Pixel, or broken form POST destination?"*
- **Required Information**: Advertising & Tracking Pillar score (0–100), detected missing pixel IDs, unlinked `wa.me` UTM parameters, broken thank-you redirect routes.
- **Decision**: *"Which campaign landing pages have tracking or form validation defects?"*
- **Primary Action**: Export diagnostic findings or adjust the sensitivity sliders in the **Revenue Scenario Simulator**.

#### Persona 3: The Agency Owner / Lead Generation Consultant
- **Mental Model**: Growth-oriented, seeks proprietary technical leverage to win high-ticket monthly retainers.
- **Trigger**: Needs cold outreach targets with undeniable, empirical proof of website flaws.
- **Question**: *"Which 50 local e-commerce brands in my region have broken WhatsApp buttons and missing Meta pixels?"*
- **Required Information**: Prospect lead score, count of critical conversion leaks, automated grounded pitch draft citing real code issues.
- **Decision**: *"Which qualified prospects should my BDR team reach out to today?"*
- **Primary Action**: Click **"Generate Grounded Cold Pitch"** and deliver a white-labeled audit report.

#### Persona 4: The Full-Stack / DevOps Engineer
- **Mental Model**: Analytical, skeptical of automated scanners, demands reproducible technical evidence.
- **Trigger**: Assigned a ticket to fix reported conversion drop-offs or security warnings.
- **Question**: *"What is the exact DOM selector, HTTP status, or invalid regex in this form action?"*
- **Required Information**: Raw technical evidence drawer (HTTP headers, failing HTML snippets, missing CSP directives, RFC-3966 telephone link format violations).
- **Decision**: *"What code change is required in my repository to resolve this finding?"*
- **Primary Action**: Copy the verified recommendation snippet, push a fix, and trigger an **Instant Re-Audit**.

#### Persona 5: The Platform System Administrator
- **Mental Model**: Operational security, multi-tenant isolation, platform resource reliability.
- **Question**: *"Are crawler queues running smoothly and are API rate limits preventing abuse?"*
- **Required Information**: System health KPIs, active subscriptions, failed audit queues, admin audit log trail.
- **Decision**: *"Are any tenant organizations violating terms or exceeding quotas?"*
- **Primary Action**: Moderate users, inspect webhook event deliveries, or adjust commercial entitlements.

---

## 3. Master Information Architecture & Progressive Navigation

```
[LEADGUARD OS V6 APP SHELL]
│
├── 🌐 PUBLIC VISITOR SURFACE (No Authentication)
│   ├── / .................................... Public Homepage & Instant Free Scanner
│   ├── /scan/:scanId ........................ Public Diagnostic Result Dossier
│   ├── /checkout/express-fix ................ Guest 1-Click Remediation Checkout (₹2,999)
│   ├── /login ............................... Organization Sign In
│   ├── /register ............................ Workspace Creation & Scan Linkage
│   ├── /password-reset ...................... Credential Recovery Flow
│   ├── /public/reports/:token ............... Cryptographic Public Share Report
│   └── /privacy, /terms, /cookies, /refund .. Legal & Compliance Policies
│
├── 📊 CORE SUBSCRIBER WORKSPACE (Authenticated Customer)
│   ├── /dashboard ........................... Executive Command Center & Health
│   ├── /websites ............................ Tracked Domain Inventory
│   │   └── /websites/:id .................... Domain Overview & Audit Trigger
│   ├── /audits .............................. Historical Diagnostic Crawls
│   │   └── /audits/:id ...................... Comprehensive Audit Dossier (8 Deep Views)
│   ├── /monitoring .......................... 24/7 Continuous Watchdog Monitors
│   │   └── /monitoring/:id .................. Monitor Incident Stream & Baseline Diffs
│   ├── /reports ............................. Immutable Client Reports
│   │   └── /reports/:id ..................... Versioned Report Snapshot & Share Links
│   └── /billing ............................. Monetization, Plans & Entitlements
│
├── 💼 AGENCY GROWTH SUITE (Visible for Agency Tiers & Roles)
│   ├── /agency .............................. Agency Operations Command Center
│   ├── /agency/clients ...................... Multi-Tenant Client Workspaces
│   │   └── /agency/clients/:id .............. Client Domain Grouping & Branding
│   ├── /agency/prospects .................... 500-Site Batch Prospect Hunter
│   │   └── /agency/prospects/:id ............ Prospect Dossier & Grounded Pitch Generator
│   ├── /agency/widgets ...................... Embeddable Lead Capture Diagnostic Forms
│   ├── /agency/competitors .................. Multi-Domain Technical Benchmark Radar
│   └── /testimonials ........................ Client Social Proof & Review Moderation
│
├── 🛠️ DEVELOPER & INTEGRATIONS (Visible for Admins & Developers)
│   ├── /developer ........................... API Overview & Integration Guide
│   ├── /developer/api-keys .................. Scoped Cryptographic API Credentials
│   └── /developer/webhooks .................. HMAC-Signed Event Dispatchers
│
├── ⚙️ WORKSPACE SETTINGS (All Authenticated Users)
│   ├── /settings ............................ Organization Profile & Team Members
│   ├── /settings/notifications .............. Email & Webhook Alert Routing
│   └── /settings/security ................... Multi-Session Management & 2FA
│
└── 🔒 PLATFORM ADMINISTRATION (Platform Admins Only)
    ├── /admin ............................... Platform Telemetry & Revenue Metrics
    ├── /admin/users ......................... User Account Moderation & Suspension
    ├── /admin/organizations ................. Workspace Quotas & Plan Overrides
    └── /admin/audit ......................... Immutable System Security Audit Logs
```

---

## 4. Public Homepage Architecture & Proof Strategy

The homepage must communicate LeadGuard's core value proposition within **3 seconds** by prioritizing an interactive diagnostic experience over decorative SaaS marketing.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. HEADER: Brand Logo | Trust Badges | Pricing | Sign In | Free Scan CTA   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. HERO: "Find the lead leaks costing your business customers."             │
│    Sub: Instant diagnostic crawl of forms, WhatsApp, calls, & tracking      │
│    [ INPUT: https://yourdomain.com ] [ BUTTON: Run Free Diagnostic Scan ]  │
│    Micro-proof: "✓ Zero Firebase • ✓ SSRF-Hardened • ✓ 100% Free Analysis" │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. LIVE INTERACTIVE DIAGNOSTIC PREVIEW (Labeled Demo Simulation)            │
│    [ Interactive Simulator Pill: "Sample Diagnostic Report — Demo Mode" ]   │
│    - Score Ring (84/100) • 4 Pillar Bars (Lead, Ads, SEO, Security)        │
│    - Real Discovered Leaks: Broken WhatsApp (+18% ROI), Missing Meta Tag    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. THE 4 PILLARS OF LEAD LEAKAGE (How LeadGuard Protects Revenue)           │
│    - Pillar 1: Form & Inbound Validation Engine                             │
│    - Pillar 2: Advertising & Attribution Pixel Integrity                    │
│    - Pillar 3: WhatsApp & Phone Link Hygiene (RFC-3966 Format)              │
│    - Pillar 4: 24/7 Continuous Watchdog Monitoring                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. REVENUE OPPORTUNITY LOSS CALCULATOR (Interactive Simulator)              │
│    [ Sliders: Monthly Visitors (10k) × Conv Rate (2%) × Lead Value (₹5,000) ]│
│    Output: ₹50,000 Estimated Opportunity Loss at Risk                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. TRANSPARENT COMMERCIAL TIERS (Direct API Synced Pricing)                 │
│    - Free Tier (₹0) • Pro (₹2,900/mo) • Agency (₹7,900/mo) • Express (₹2,999)│
├─────────────────────────────────────────────────────────────────────────────┤
│ 7. FOOTER: Navigation Links | Compliance | Security Badges | Privacy       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Resolution of P1 Hardcoded Metrics:
- **Decision**: Adopt **Strategy C — Interactive Product Simulation with Explicit Demo Labeling**.
- **Implementation Rule**: The dashboard mockup card on the landing page MUST include a persistent, styled banner: `[Sample Diagnostic Report — Example Agency Data]`. All interactive controls in this preview manipulate isolated client-side mock fixtures with clear disclaimer tooltips.

---

## 5. Free Scan & Diagnostic Engine Lifecycle (12-State Matrix)

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
                                             [STATE: SCANNING (0-100%)]
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
              [STATE: COMPLETED]            [STATE: RATE LIMITED]           [STATE: ERROR / TIMEOUT]
              - Displays Score Dossier      - Shows Cooldown Timer          - Displays Friendly Fallback
              - CTAs: Express Fix or Save   - Explains 3 scans/hr limit     - Single-click Retry Action
```

### Complete 12-State Specification:

| State | User View | User Understanding | Available Primary Action |
| :--- | :--- | :--- | :--- |
| **1. Idle** | High-contrast input bar with placeholder `https://yourcompany.com`. | Ready to enter any public domain. | Type URL and press Enter. |
| **2. Submitting** | Input disabled; button shows spinning pulse and *"Initializing scanner..."*. | Request is in-flight to API server. | Wait (200-500ms). |
| **3. Queued** | Redirected to `/scan/:scanId`; displays queue position badge. | Scan job is registered in BullMQ queue. | Can bookmark or wait. |
| **4. Scanning** | Animated progress bar with live phase badges (*"Inspecting forms"*, *"Validating WhatsApp"*). | Crawler is actively parsing the target HTML. | Watch real-time inspection stages. |
| **5. Partial Progress** | Displays discovered tags/links as they are found. | Site is responsive and actively streaming findings. | None (Auto-advances). |
| **6. Completed** | Full diagnostic dossier renders with Health Score, 4 Pillars, Top 5 findings. | Audit is finished and saved in database. | **"Fix My Leaks (₹2,999)"** or **"Save Audit"**. |
| **7. Rate Limited** | Friendly alert card explaining the 3 scans/hour public rate limit. | Protects platform crawlers against abuse. | Sign in for unlimited audits. |
| **8. Invalid URL** | Red inline input border with message: *"Please enter a valid HTTP/HTTPS URL"*. | Format error caught before network request. | Correct domain and resubmit. |
| **9. Server Error** | Alert banner: *"Unable to reach scan engine. Please try again in a moment."* | Temporary backend service hiccup. | Click **"Retry Scan"**. |
| **10. Scan Failed** | Error card: *"Target website timed out or blocked crawler (HTTP 403/504)"*. | Target website is offline, firewalled, or anti-bot protected. | Check target URL accessibility. |
| **11. Scan Expired** | Warning banner: *"This guest scan was performed >24 hours ago."* | Guest scan caches are cleaned periodically. | Click **"Rerun Fresh Scan"**. |
| **12. Result Unavailable** | Empty state card: *"Scan record not found."* | Invalid scan ID in URL parameter. | Return to homepage to start fresh scan. |

---

## 6. Scan Result & Audit Dossier Progressive Disclosure

The Scan Result page (`/scan/:scanId`) and Full Audit Dossier (`/audits/:id`) use **structured progressive disclosure** to prevent data overload while providing full technical depth.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: ABOVE-THE-FOLD EXECUTIVE IMPACT (What happened & Why it matters)    │
│ ┌──────────────────────┐ ┌────────────────────────────────────────────────┐ │
│ │  HEALTH SCORE RING   │ │  POTENTIAL OPPORTUNITY LOSS ESTIMATE           │ │
│ │      68 / 100        │ │  ₹42,000 / month at risk [Moderate Confidence] │ │
│ │  Needs Attention     │ │  Assumptions: 10k visits • 2% conv • ₹5k lead │ │
│ └──────────────────────┘ └────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  4 PILLAR HEALTH GAUGE                                                  │ │
│ │  Lead Capture: 55/100 | Advertising: 70/100 | SEO: 85/100 | Sec: 60/100 │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: RANKED PRIORITY REMEDIATION ENGINE (What to fix first)             │
│ [CRITICAL] Broken WhatsApp Link — Missing country code strips leads (-25 pts)│
│            Recommendation: Update href to `https://wa.me/919876543210`     │
│            [ Button: Copy Fix Snippet ] [ Button: Order Express Fix ]       │
│ [HIGH]     Missing Meta Pixel — Ad traffic un-attributed (-15 pts)          │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: DEEP DIAGNOSTIC TABS (Detailed Investigation)                      │
│ [Tab 1: Findings (12)] [Tab 2: Scenarios] [Tab 3: Funnel] [Tab 4: WhatsApp] │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  EXPANDABLE TECHNICAL EVIDENCE DRAWER                                   │ │
│ │  - Target DOM Element: `<a href="whatsapp://send?phone=">`              │ │
│ │  - HTTP Response Code: 200 OK                                           │ │
│ │  - Scanner Rule ID: LG-002 (WhatsApp Format Validator)                  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Executive Dashboard Architecture ("The Daily Command Center")

The customer dashboard (`/dashboard`) is the central operational command center for business owners and growth teams.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Active Website Switcher | Last Audit Timestamp | [ + Run New Audit ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 1: EXECUTIVE INTELLIGENCE SUMMARY                                   │
│ "acme.com has 2 critical lead leakage blockers causing ~₹35,000/mo risk."   │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 2: CORE KPI METRICS (4-Column Grid)                                 │
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐ │
│ │ Lead Health     │ │ Est. Loss / mo  │ │ Critical Leaks  │ │ Watchdog    │ │
│ │     72/100      │ │    ₹35,000      │ │   2 Blockers    │ │ 24/24 OK    │ │
│ │ (+4 pts vs prev)│ │ Medium Conf     │ │ Immediate Action│ │ 100% Up    │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 3: SPLIT OPERATIONAL LAYOUT (2fr / 1fr)                             │
│ ┌──────────────────────────────────────────┐ ┌────────────────────────────┐ │
│ │ ⚡ PRIORITY REMEDIATION ENGINE           │ │ 📡 24/7 WATCHDOG STREAM    │ │
│ │ Top 3 Ranked Technical Fixes             │ │ Live Incident & Diff Log   │ │
│ │ 1. Fix Contact Form Action URL (-20 pts) │ │ • Today 14:30: Form check  │ │
│ │ 2. Add Meta Pixel ID (-15 pts)           │ │ • Today 08:00: Baseline OK │ │
│ │ 3. Format Tel RFC-3966 link (-10 pts)    │ │ • Yesterday: SSL renewed   │ │
│ └──────────────────────────────────────────┘ └────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ SECTION 4: HISTORICAL AUDIT TREND & RECENT CRAWLS TABLE                     │
│ Date | Crawled Pages | Health Score | Score Delta | Critical Issues | Action│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Continuous Watchdog & Retention Monitoring UX

The Watchdog turns one-off audit users into **sticky monthly subscribers** by monitoring conversion health 24/7.

```
[SCHEDULED RECURRING CRAWL (e.g. Every 15 min)]
                    │
                    ▼
[BASELINE DIFFING ENGINE]
  - Compares DOM nodes, form actions, & tags vs previous clean baseline
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
(No Changes / Healthy)   (Regression Detected: e.g. Form Action Stripped)
       │                         │
[STATE: STABLE (Green)]   [STATE: INCIDENT OPEN (Red)]
                                 │
                                 ├──> 1. Triggers Email / Webhook Alert
                                 ├──> 2. Logs Incident in Timeline
                                 └──> 3. User Clicks "Acknowledge Incident"
                                             │
                                      [STATE: ACKNOWLEDGED]
                                             │
                                      [STATE: RESOLVED upon next successful crawl]
```

### Monitoring UI Views:
1. **Monitor List (`/monitoring`)**: Table of tracked domains with frequency (15m, 1h, 24h), current status (`HEALTHY`, `REGRESSION_DETECTED`, `PAUSED`), last run timestamp, and incident count.
2. **Monitor Detail (`/monitoring/:id`)**: Comprehensive incident timeline, baseline diff comparison tool, alert notification toggles, and instant **"Run Manual Crawl"** trigger.

---

## 9. Report Generation & Cryptographic Sharing UX

Reports serve four distinct audiences with tailored information density:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REPORT AUDIENCE MATRIX                            │
├───────────────────┬───────────────────────────────────┬─────────────────────┤
│ Audience          │ Information Focus                 │ Output Format       │
├───────────────────┼───────────────────────────────────┼─────────────────────┤
│ 1. Business Owner │ High-level health, ROI loss, fixes│ Executive PDF       │
│ 2. Marketer / CRO │ Funnel drop-offs, tracking tags   │ Interactive Web Link│
│ 3. Agency Client  │ White-labeled agency branded audit│ Branded PDF / Web   │
│ 4. Tech Developer │ Exact DOM nodes, headers, snippets│ Developer JSON / Web│
└───────────────────┴───────────────────────────────────┴─────────────────────┘
```

### Features:
- **Immutable Versioning**: Creating a report saves a frozen JSON snapshot in PostgreSQL (`ReportVersion`) ensuring historical client reports remain unchanged.
- **Cryptographic Share Links (`/public/reports/:token`)**: SHA-256 token authorization, optional password protection, expiration controls, and access logs.
- **Asynchronous PDF Worker**: BullMQ background rendering with progress indicator and download button.

---

## 10. Agency Growth Suite Architecture

The Agency Suite provides growth tools for agencies and consultants to prospect, pitch, and retain clients.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AGENCY SUITE OPERATIONAL WORKFLOW                       │
│                                                                             │
│  1. 500-SITE PROSPECT HUNTER (/agency/prospects)                            │
│     - Upload CSV or input batch domain list                                 │
│     - Autonomous batch diagnostic crawl                                     │
│     - Filter prospects by Lead Score < 60 and Critical Leak Count >= 2      │
│                                 │                                           │
│                                 ▼                                           │
│  2. GROUNDED COLD PITCH GENERATOR (/agency/prospects/:id)                   │
│     - Asynchronous AI pitch generation grounded in empirical scan findings  │
│     - Tone controls: "Consultative", "Urgent / Critical", "Technical"       │
│     - 1-Click Copy Cold Email or LinkedIn InMail Draft                      │
│                                 │                                           │
│                                 ▼                                           │
│  3. EMBEDDABLE DIAGNOSTIC WIDGETS (/agency/widgets)                         │
│     - Whitelisted-domain iframe widget for agency website                   │
│     - Captures inbound prospect leads via free automated audits             │
│                                 │                                           │
│                                 ▼                                           │
│  4. MULTI-TENANT CLIENT WORKSPACES (/agency/clients)                        │
│     - Isolated workspaces per client with custom agency logo and colors     │
│     - Automated monthly white-label PDF audit dispatches                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Developer Platform Architecture

- **API Keys (`/developer/api-keys`)**: Generate scoped credentials (`lg_live_...`, `lg_test_...`) with SHA-256 hashing and granular RBAC permissions (`AUDIT_RUN`, `MONITORING_VIEW`, etc.).
- **Webhooks (`/developer/webhooks`)**: Register endpoints for events (`audit.completed`, `monitoring.incident_opened`). All payloads include `X-LeadGuard-Signature` HMAC-SHA256 headers.
- **Interactive OpenAPI 3.1 (`/api/v1/public/docs`)**: Interactive Swagger / Scalar documentation for automated developer onboarding.

---

## 12. Platform Administration Architecture

- **Admin Metrics (`/admin`)**: Platform aggregate telemetry (total registered users, tenant organizations, active MRR, BullMQ queue lengths, failed crawl rates).
- **User Moderation (`/admin/users`)**: Search users, toggle account active status, terminate compromised sessions.
- **Organization Management (`/admin/organizations`)**: Inspect tenant entitlements, override scan quotas, suspend terms-of-service violators.
- **Security Audit Logs (`/admin/audit`)**: Immutable log table of all administrative actions with actor IP and timestamps.

---

## 13. Guest-to-Paid & Guest-to-Account Conversion Architecture

```
                                [GUEST FREE SCAN]
                                        │
                                        ▼
                           [SCAN RESULT (/scan/:scanId)]
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
          PATH A: 1-CLICK REMEDIATION             PATH B: CREATE ACCOUNT
       - Clicks "Fix My Leaks — ₹2,999"        - Clicks "Save Audit & Monitor"
       - Navigates to /checkout/express-fix    - Navigates to /register?scanId=...
       - Collects Guest Email & Name           - User registers new organization
       - Opens Razorpay modal                  - Backend automatically migrates
       - Payment verified -> Ticket queued       guest scan into user workspace
                                               - User lands on /dashboard with
                                                 their scanned website active!
```

### Edge-Case Handling:
- If automatic scan migration fails, the system logs the event in `AdminAuditLog` and displays a banner on the dashboard: *"Your recent scan for [domain] is ready — Click to link to this workspace"*.

---

## 14. Responsive Viewport Strategy

| Breakpoint | Target Form Factor | Navigation Layout | Grid Behavior | Table & Chart Adaptation |
| :--- | :--- | :--- | :--- | :--- |
| **375px** | Mobile Phone | Collapsed mobile menu bar; floating sticky bottom CTA. | Single-column stack (1fr). Fixed padding: 12px. | Tables convert to scannable card lists; score rings scale to 120px. |
| **768px** | Tablet Portrait | Compact icon-rail sidebar (64px width). | 2-column grid (1fr 1fr). | Tables scroll horizontally with sticky first column. |
| **1024px** | Tablet Landscape / Laptop | Full expanding sidebar (240px width). | 3-column metrics grid. | Standard data tables with pagination. |
| **1440px+** | Desktop Monitor | Full fixed sidebar + sticky contextual sub-header. | 4-column KPI grid; 2fr/1fr operational split. | Full data tables with inline quick actions. |

### Mobile 375px Horizontal Scroll Fix:
- Replace fixed pixel widths in `.pricingGrid` and `.topbarActions` with `minmax(0, 1fr)` and `flex-wrap: wrap`.
- Enforce `overflow-x: hidden` on root app shell with `max-width: 100vw`.

---

## 15. Accessibility Architecture (WCAG 2.1 AA Compliance)

1. **Keyboard Traversal**: Full `Tab` navigation order across all interactive elements; visible focus ring (`2px solid var(--primary)` with `2px offset`).
2. **Form Labels & Error States**: Explicit `htmlFor` attributes matching input `id`s; error messages linked via `aria-describedby`.
3. **Color Contrast Ratios**:
   - Primary text (`#f8fafc`) on dark surfaces (`#090d16`, `#111726`): **14.2:1** (Exceeds WCAG AAA requirement of 7:1).
   - Muted secondary text (`#94a3b8`) on surfaces: **5.1:1** (Exceeds WCAG AA requirement of 4.5:1).
4. **Touch Target Sizing**: Minimum 44px × 44px clickable bounding box on all mobile buttons and navigation links.

---

## 16. Frontend Performance Architecture & Route-Level Code Splitting

```
[VITE PRODUCTION BUNDLE RECONSTRUCTION]
│
├── 📦 Core Vendor Chunk (React, ReactDOM, QueryClient) .......... ~140 kB (gzip: ~45 kB)
├── 📦 Shared Design System Chunk (Styles, Tokens, UI Primitives) ~35 kB  (gzip: ~8 kB)
│
├── ⚡ Lazy-Loaded Route Bundles (React.lazy + Suspense):
│   ├── 📄 Public Landing Chunk (LandingPageView) ................ ~45 kB  (Loaded on /)
│   ├── 📄 Auth Chunk (Login, Register, PasswordReset) .......... ~25 kB  (Loaded on /login)
│   ├── 📄 Scan Result Chunk (ScanResultView) .................... ~55 kB  (Loaded on /scan/:id)
│   ├── 📊 Dashboard Chunk (DashboardView) ....................... ~65 kB  (Loaded on /dashboard)
│   ├── 📑 Audits Chunk (AuditDetailView + Subtabs) .............. ~95 kB  (Loaded on /audits/:id)
│   ├── 📡 Monitoring Chunk (MonitoringView, MonitorDetail) ...... ~50 kB  (Loaded on /monitoring)
│   ├── 💼 Agency Suite Chunk (Prospects, Pitches, Widgets) ...... ~110 kB (Loaded on /agency/*)
│   ├── 📄 Reports Chunk (ReportListView, ReportDetailView) ...... ~40 kB  (Loaded on /reports/*)
│   └── 🔒 Admin & Dev Chunk (AdminDashboard, ApiKeys, Webhooks) . ~60 kB  (Loaded on /admin/*)
```

**Target Outcome**: Initial page load reduced from **1,258 kB** to **< 180 kB**, dramatically improving First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

---

## 17. Top 15 Prioritized Implementation Roadmap

| Priority | Feature / Module | Architectural Impact | Complexity |
| :---: | :--- | :--- | :---: |
| **1** | **Standardize Design Tokens in `styles.css`** | Eliminates Tailwind leakage in agency/admin views. | Low |
| **2** | **Mobile 375px Layout Fix** | Resolves horizontal scroll overflow across all public views. | Low |
| **3** | **Route-Level Code Splitting (`React.lazy()`)** | Reduces initial bundle size by ~85%. | Medium |
| **4** | **Landing Page Demo Banner & Interactive Simulation** | Resolves P1 credibility risk of hardcoded preview data. | Low |
| **5** | **Guest Scan → Registration Linkage** | Auto-migrates guest audits into new accounts upon signup. | Medium |
| **6** | **Refine `ScoreRing.tsx` & `FindingCard.tsx`** | Canonicalizes visual score rings and evidence drawers. | Medium |
| **7** | **Executive Dashboard Decision Framework** | Surfaces top intelligence, opportunity loss, and priority actions. | Medium |
| **8** | **Interactive Revenue Scenario Simulator Component** | Makes financial opportunity loss adjustable and transparent. | Medium |
| **9** | **Audit Dossier Progressive Disclosure Refactor** | Reorganizes 8 deep tabs into an intuitive 3-tier hierarchy. | Medium |
| **10** | **Continuous Watchdog Incident Lifecycle UI** | Polishes baseline diffing and 1-click incident acknowledgment. | Medium |
| **11** | **Client Workspace Domain Assignment Picker** | Adds modal to assign tracked sites to agency client workspaces. | Low |
| **12** | **Prospect Hunter Batch Lead Scoring Flow** | Streamlines batch CSV prospecting and qualified lead filtering. | High |
| **13** | **Grounded AI Cold Pitch Generator UI** | Connects defect findings directly to customizable pitch copy. | Medium |
| **14** | **Cryptographic Report Share Link Management** | Adds password protection toggles and access revocation modals. | Low |
| **15** | **Developer API Key & Webhook HMAC UI** | Provides key generation modal and webhook test ping delivery logs. | Low |
