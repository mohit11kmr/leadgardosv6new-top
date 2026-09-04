# PRD: LeadGuard OS V6 — Multi-Tenant Website Diagnostics SaaS

**Product Name:** LeadGuard OS V6 (product family: LeadGuard · RevenueShield · VaultGuard)
**Version:** 1.0
**Date:** September 3, 2026
**Author:** Mohit Kumar
**Status:** Draft

> **Source-of-truth note:** This PRD is derived entirely from the existing codebase
> (`apps/`, `packages/`, `tests/`, root config) and the source-verified docs in
> this same `docs/` folder (notably `LEADGUARD_OS_BLUEPRINT.md`,
> `VAULTGUARD_ROADMAP.md`, `BILLING.md`, `ENTITLEMENTS.md`, `ARCHITECTURE.md`,
> and `REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md`). It documents what the product
> **is**, what it **sells**, and where it's **going** — not aspirational prose
> detached from code. Where a section describes a *plan* rather than a *built
> reality*, that is stated explicitly and honestly.

---

## 1. Executive Summary

### 1.1 Product Overview

LeadGuard OS V6 is a **multi-tenant SaaS platform** that audits websites for
business-leakage and security issues and turns the findings into scored,
shareable reports with ongoing monitoring and agency-facing outreach tooling.

The product is organized as a **three-pillar family**, all sharing one scanning
engine, one report pipeline, and one subscription:

| Pillar | Product | Answer for the customer |
|--------|---------|--------------------------|
| **Leads** | LeadGuard | "Tumhari site leads leak kar rahi hai kahaan? Thik karo." |
| **Revenue** | RevenueShield | "Tumhara paisa (orders/checkout/billing) leak na ho." |
| **Security** | VaultGuard | "Bug (hackable exposure) kahaan hai — aur verified fix hai." |

The core diagnostic sweep checks for: broken tracking pixels, missing SEO/meta
tags, insecure headers, exposed debug/config files, TLS problems, missing
WhatsApp/tel CTAs, lead-form issues, cart/checkout problems, consent failures,
and (VaultGuard) security bugs such as debug-mode exposure, weak SSL/TLS,
missing brute-force protection, and exposed assets.

### 1.2 Problem Statement

- **India/SMB web** is a security and conversion vacuum — most small business
  websites have zero security controls and frequent lead/revenue leakage.
- **Manual pentests** cost ₹50k–₹2L and take 1–4 weeks — unaffordable and
  unreadable for SMBs.
- **Existing tools** are either too complex (nuclei, generic scanners) or too
  expensive (enterprise).
- **Agencies** want a white-label tool to sell "security/health included" to
  clients, but have no turnkey product.

### 1.3 Solution

A SaaS platform (with agency/white-label tier) that:
- Automates website health + security diagnostics via an in-house scan engine
- Generates human-readable, scored, evidence-backed reports (with share links)
- Provides continuous monitoring ("Watchdog") and verified-fix retest loops
- Sells as a tiered subscription with Razorpay billing (INR/paise)
- Gives agencies prospecting + white-label resell tooling

### 1.4 Target Market

| Segment | Who | Pain Point |
|---------|-----|------------|
| **Digital marketing agencies** (primary) | Agencies already reselling diagnostics | White-label resell, margin, retention, "security included" pitch |
| **Local SMBs / business owners** | Pro self-serve users | Know before breach / before lead leak |
| **Freelance / dev shops** | Site builders (React/WP/Laravel) | Per-project deliverable "security sign-off" |

### 1.5 Success Metrics (targets to validate)

| Metric | 6-month target |
|--------|---------------|
| Registered orgs | 1,000 |
| Paying customers | 100 |
| MRR (INR) | ₹500,000 |
| Audited sites with ≥1 HIGH+ finding | >60% (proof-of-value for upsell) |
| Retest pass rate | >95% (false-positive calibration) |
| NDR (net-dollar retention) | >110% via monitoring renewals |

---

## 2. User Personas

### 2.1 Primary: Marketing Agency Owner
**Name:** Amit, 34, runs a 12-person digital agency
- **Goal:** Resell diagnostics to 50+ clients with their own branding, earn margin
- **Frustration:** Can't afford per-client pentests; needs a white-label "included" value prop
- **Behavior:** Runs audits on prospects (competitor radar), pitches findings, assigns fixes
- **Willingness to pay:** ₹14,999+/mo (Agency tier) or per-seat

### 2.2 Secondary: Local SMB Owner
**Name:** Priya, 38, owns a D2C e-commerce store
- **Goal:** Protect customer data, avoid lead/revenue leak, know if site is "safe"
- **Frustration:** No security team, can't read a pentest report
- **Behavior:** Runs monthly audit, acts on critical findings
- **Willingness to pay:** ₹4,999/mo (Pro) or ₹0 (Free)

### 2.3 Tertiary: Startup CTO / Lead Dev
**Name:** Raj, 30, CTO at a Series A SaaS startup
- **Goal:** Maintain security baseline, satisfy compliance/agency buyers
- **Frustration:** Engineering time too valuable for manual scanning
- **Behavior:** Runs security (VaultGuard) audits + monitoring, integrates via API/webhooks
- **Willingness to pay:** Pro/Agency + API access

---

## 3. Feature Requirements

### 3.1 Core Diagnostic Engine (built)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Lead leakage audit** | P0 | broken tracking pixels, missing SEO/meta, form issues, consent, WhatsApp/tel CTA |
| **Revenue audit** | P0 | cart/checkout/billing leakage (RevenueShield) |
| **Security audit (VaultGuard)** | P0 | debug exposure, SSL/TLS health, auth-guard, exposed assets |
| **Scoring** | P0 | Lead/Advertising/SEO/Security/overall 0–100 (`scoring.ts`) |
| **Guest/free scan** | P0 | public `/public/free-scan`, teaser result |
| **Verified-fix retest loop** | P1 | OPEN → TRIAGED → FIXED → VERIFIED (VaultGuard LG-040) |
| **AI Hinglish remediation** | P1 | cached fix-guidance per detection key (LG-039) |

### 3.2 Reporting (built)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Shareable reports** | P0 | `/reports/share/:token` (public, optional password) |
| **Branded/white-label reports** | P0 | company name/logo/colors/footer via `whiteLabelService` |
| **PDF export** | P0 | real headless-Chromium `page.pdf()` (`%PDF-` verified) |
| **Executive summary** | P0 | plain-language overview (`buildExecutiveSummary`) |
| **Business impact** | P0 | `business-impact.ts` + `priority.ts` weighting |

### 3.3 Monitoring & Agency (built)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Watchdog monitoring** | P0 | 5-min uptime/health checks, regression engine, alerts |
| **Agency prospecting** | P0 | prospect campaigns, competitor radar, AI pitches |
| **White-label widgets** | P0 | public embeddable scan badges |
| **Client workspaces** | P0 | multi-client org management |

### 3.4 Developer / Public API (built)

| Feature | Priority | Description |
|---------|----------|-------------|
| **API keys** | P0 | scoped keys for programmatic access |
| **Webhooks** | P0 | transactional outbox, retry, signing (SSRF-safe) |
| **Public REST API** | P0 | `/public/*`, `/api-keys`, `/webhooks` |
| **Razorpay billing** | P0 | checkout, subscriptions, HMAC webhooks |

### 3.5 Planned / Roadmap (NOT yet built — Phase 2+)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Customer 360 view** | P1 | `/admin/organizations/:id` join endpoint (missing today) |
| **Refund/credits model** | P1 | no Refund model, no credit ledger exists |
| **Coupons/offers engine** | P2 | no commerce discounting exists |
| **Nuclei sidecar** | P2 | optional Docker deep-scan (host-only, throttled) |
| **CVE/version fingerprinting** | P2 | offline advisory bundle + fingerprint lookup |
| **Authenticated Playwright scans** | P2 | opt-in, customer test account only |
| **Admin ops console + observability** | P1 | current admin is gated by a single boolean; no views for security events |

---

## 4. User Stories

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-001 | As a visitor, I can run a free scan of my site URL | URL validated, SSRF-safe, teaser result within budget |
| US-002 | As an SMB owner, I can register a domain and verify ownership | DNS TXT / meta-tag proof required before scan |
| US-003 | As a Pro user, I can run a full audit | entitlement quota enforced, job queued, progress shown |
| US-004 | As a user, I can view findings sorted by impact | severity × business impact, evidence-backed |
| US-005 | As a user, I can generate a shareable/PDF report | branded, immutable snapshot, share-link security |
| US-006 | As an agency, I can white-label reports for my client | branding applied, report under agency's brand |
| US-007 | As a user, I can enable Watchdog monitoring | scheduled re-scans, alerts, regression detection |
| US-008 | As a user, I can retest a finding after fixing | status transitions OPEN→FIXED→VERIFIED |
| US-009 | As an agency, I can prospect & pitch clients | competitor radar, AI pitch auto-includes top security finding |
| US-010 | As a dev, I can use API keys + webhooks | scoped keys, signed, retried, outbox-guaranteed |
| US-011 | As a user, I can subscribe/upgrade/cancel | Razorpay checkout, entitlement changes, billing history |

---

## 5. Non-Functional Requirements

### 5.1 Performance
| Metric | Requirement |
|--------|-------------|
| Scan initiation | <5s from API call to QUEUED |
| Full audit | time-boxed per-run global timeout |
| API p95 latency | <500ms for non-scan reads |
| Crawl budget | bounded pages/depth, parallel, time-boxed |

### 5.2 Security (verified in code)
| Requirement | Implementation |
|-------------|---------------|
| **SSRF safety** | All user-URL fetches through `validateExternalUrl` / `resolveAndValidateExternalUrl` + `fetchPinned` (hard block on loopback/private/metadata) |
| **IDOR defense** | Every query filtered by `organizationId` from verified JWT claims, never client-supplied |
| **Auth** | JWT (15-min access) + rotating hashed refresh tokens, reuse detection, Argon2id |
| **Secrets** | Webhook signing secrets AES-256-GCM encrypted (`secret-encryption.ts`, server-only) |
| **Payment integrity** | server-side verification, HMAC webhooks, idempotency, paise-precision |
| **Org-scoped RBAC** | role-based authorization (`middleware/rbac.ts`) |
| **Input validation** | Zod (partial coverage — see audit) |

### 5.3 Compliance
- GDPR-compliant funnel tracking (consent fields, sanitized evidence)
- DPDP (India Data Protection Act 2023) aware — security awareness is a timing tailwind
- No real-user PII collection during scans; mock/test credentials only

### 5.4 Scalability
- Nursed: BullMQ 5 (14 queues) + Redis for rate limiting
- PostgreSQL multi-tenant with transactional outbox
- Planned: real deployment target NOT defined (see §14 blockers)

---

## 6. Pricing Strategy (from `BILLING.md`, current)

| Tier | Code | Price | Audits/mo | Monitored Sites | Monitoring | API | White-label |
|------|------|-------|-----------|-----------------|-----------|-----|-------------|
| **Starter** | `FREE` | ₹0 | 3 | 1 | ❌ | ❌ | ❌ |
| **Pro** | `PRO` | ₹4,999/mo | 50 | 5 | ✅ | ✅ | ❌ |
| **Agency** | `AGENCY` | ₹14,999/mo | 500 | 50 | ✅ | ✅ | ✅ |
| **Enterprise** | `ENTERPRISE` | Custom | Unlimited | Unlimited | ✅ | ✅ | ✅ |

**Add-ons:**
- **Express Fix** (₹2,999 one-time): engineer-assisted remediation of critical findings.
- **Watchdog 24/7** (₹299/mo): continuous 5-min monitoring.

---

## 7. Go-to-Market

1. **Upsell rail:** "Security found X issues" box inside audit report + share link.
2. **Agency pitch fuel:** AI pitch auto-includes strongest security finding.
3. **Competitor radar tie-in:** show "your competitor's site exposes debug mode."
4. **Educational content:** "Is your site on the bug list every hacker can find?"
5. **Watchdog renewals** → NDR via monitoring.

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positives destroy trust | Medium | Critical | Fixture-based DoD per scanner; severity caps on light probes; retest pass rate tracked |
| Scan abuse / legal exposure | Medium | Critical | Ownership gate + throttle + SSRF validator + ToS consent |
| AI remediation hallucination | Medium | Medium | Detect-key-templated suggestions + `claim-validator.ts` validation |
| Scheduler spam | Medium | Medium | Entitlement quota + webhook dedupe via outbox |
| No deployment/infra target | High | High | Must be resolved before hosted launch (see §14) |
| Password-reset email absent | High | Critical | P0 account-recovery gap — nothing dispatches reset email |

---

## 9. MVP Scope Boundary

The product is **already built and mature** (50 models, 128 routes, real scan
engine). This PRD's MVP is therefore **not "greenfield to ship"** — it's the
**production-hardening + first-launch boundary**:

**In MVP-launch scope:**
- Fix the P0 account-recovery gap (password reset email actually sent)
- Define + stand up a real deployment target (currently none exists)
- Customer 360 join endpoint (`GET /admin/organizations/:id`)
- Refund model (no refunds possible today)
- Minimal admin observability (view SecurityEvent)

**Deferred (Phase 2+):** coupons/offers engine, credits/wallet, nuclei sidecar,
CVE fingerprinting, authenticated Playwright scans, full admin ops console.

---

## 10. Validation / Metrics

**North-star:** Fixed findings per customer-month (verified).

**Supporting:**
- NDR via monitoring renewals
- % of audited sites with ≥1 HIGH+ finding
- Retest pass rate → scanner calibration (keeps false positives near zero)

---

## 11. Honest Gaps (source-verified, from `LEADGUARD_OS_BLUEPRINT.md` / `REVENUE_INTELLIGENCE_CONTROL_PLANE_RND.md`)

| Gap | Status |
|-----|--------|
| Password-reset email never dispatched | **OPEN (P0)** — nothing sends it |
| No real deployment target (no Dockerfile/k8s/Terraform) | **OPEN** |
| Billing reconciliation doesn't call Razorpay in LIVE mode | **OPEN** |
| No Refund model / credit ledger | **OPEN** |
| Admin gated by single boolean; no `/admin/security*` views | **OPEN** |
| Monitoring scheduler "never invoked" | **FIXED** (worker boots it) |
| PDF "HTML mislabeled" + S3 silent-fallback | **FIXED** (real Chromium PDF; S3 refuses to boot without creds) |
| SecurityEvent under-covered | **STALE-BROADER** — 13 types now, just no admin view |

---

## 12. Summary

LeadGuard OS V6 is a **production-mature** multi-tenant diagnostics SaaS with a
genuinely strong customer-facing product (audits, reports, monitoring, agency
tooling, billing, RBAC, SSRF-safe scanning) and an **immature company-operating
layer** (no deployment target, no account-recovery email, no refunds, thin
admin). The path to launch is hardening the operating layer, not rebuilding the
product.
