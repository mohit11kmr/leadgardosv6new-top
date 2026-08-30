# Phase 3B-1: Homepage Product Experience Reconstruction — Implementation Report

**Document Version**: 6.1.0-phase3b1-report  
**Date**: 2026-08-30  
**Status**: COMPLETE / PASS  
**Scope**: Public Homepage (`apps/web/src/features/landing/LandingPageView.tsx`)  
**Base Commit**: `1e8f350a639caac6e1356d197658bae2ec270170`  
**Current HEAD**: `1d94eea9e7d10c423c54a739debb1b8b3a5a159c`  

---

## 1. Executive Summary & Mission Alignment

The LeadGuard OS V6 public homepage has been reconstructed from the ground up as a **premium, product-led diagnostic experience**, strictly following the Phase 2C Master UX Specification and Master Design System.

The homepage serves as the primary technical acquisition funnel:
$$\text{Homepage} \longrightarrow \text{Free Diagnostic Scan} \longrightarrow \text{Scan Dossier} \longrightarrow \text{Account / Monitoring} \longrightarrow \text{Commercial Plans}$$

### Core Value Communication:
- **Primary Message**: *"Find the lead leaks costing your business customers. Your website may look fine. Your lead flow may not."*
- **Primary Action**: Free instant technical diagnostic via high-contrast domain input bar invoking `POST /public/free-scan`.
- **Truth in Advertising**: Complete elimination of fabricated metrics, fake customer logos, and deceptive live dashboard mockups.

---

## 2. Homepage Section Architecture

The reconstructed [`LandingPageView.tsx`](file:///home/mohit/Desktop/projects/leadguard%20project/leadgardosv6new%20top/apps/web/src/features/landing/LandingPageView.tsx) implements 12 cohesive sections:

1. **Top Navigation (`<header>`)**:
   - Brand logo + `LeadGuard OS` + `V6` badge.
   - Smooth-scrolling anchor navigation: *How It Works*, *4 Pillars*, *What We Find*, *Revenue Calculator*, *Watchdog*, *Agency Suite*, *Pricing*.
   - Direct action routes: `Sign In` (`/login`) and `Run Free Scan` (auto-focuses URL input).

2. **Hero Section (Diagnostic-First)**:
   - Eyebrow chip: `LeadGuard OS V6 — Technical Diagnostic Platform`.
   - Core headline: *"Find the lead leaks costing your business customers."*
   - Subtitle: *"Your website may look fine. Your lead flow may not."*
   - Accessible URL input form with active loading spinner, client-side validation, error handling, and `POST /public/free-scan` execution.
   - Micro-proof badges: `✓ Free Diagnostic`, `✓ SSRF-Hardened Scanning`, `✓ No Credit Card Required`, `✓ 4 Scored Pillars`, `✓ Evidence-Based Code Findings`.

3. **Explicitly Labeled Sample Diagnostic Demo**:
   - Replaced misleading live dashboard mockups.
   - Mandatory visible banner: `[ Sample Diagnostic Report — Illustrative Example — Not Live Customer Data ]`.
   - Overall Health Ring (`78/100`) computed via real LeadGuard weights: $65 \times 0.35 + 75 \times 0.25 + 90 \times 0.20 + 85 \times 0.20 = 77.75 \approx 78$.
   - The 4 Pillars summary bars: Lead Capture (65), Advertising (75), SEO Hygiene (90), Security & TLS (85).
   - Realistic code-level diagnostic findings:
     - Critical: Malformed WhatsApp URL (`whatsapp://send?phone=...` missing country prefix).
     - High: Missing Meta Pixel attribution tag on landing page.
     - Medium: Telephone number rendered as plain text without `tel:` protocol.
   - Estimated Opportunity Loss Card: `~₹45,000 / month at risk` (explicitly labeled as an illustrative estimate).

4. **"How It Works" (3-Step Lifecycle)**:
   - Step 1: **Scan** (SSRF-hardened technical multi-page crawl).
   - Step 2: **Understand** (Health score, 4-pillar breakdown, code-level evidence).
   - Step 3: **Fix & Monitor** (Deploy remedies, 24/7 continuous watchdog).

5. **The 4 Scored Pillars Deep-Dive**:
   - **Lead Capture (35% Weight)**: Forms, phone links (`tel:`), WhatsApp click-to-chat.
   - **Advertising & Attribution (25% Weight)**: Meta Pixel, GTM, GA4, attribution preservation.
   - **SEO & Search Hygiene (20% Weight)**: Viewport, canonicals, robots directives.
   - **Security & TLS (20% Weight)**: HTTPS validity, HSTS, CSP, clickjacking prevention.

6. **What LeadGuard Detects (Showcase)**:
   - 6 realistic scenarios: Broken WhatsApp links, unlinked phone numbers, dead contact form POST targets, missing attribution pixels, mobile viewport flaws, and insecure transport.

7. **Revenue Intelligence & Interactive Calculator**:
   - Transparent mathematical model: $\text{Visitors} \times \text{Conversion Rate} \times \text{Lead Value} \times \text{Risk \%}$.
   - Live interactive sliders:
     - Monthly Visitors ($1,000 - 100,000+$)
     - Conversion Rate ($0.5\% - 10.0\%$)
     - Average Lead Value ($\text{₹}500 - \text{₹}25,000+$)
   - Dynamic real-time calculation of leads at risk and monthly opportunity loss.
   - Clear educational disclaimer: *"Illustrative estimate based on user-supplied assumptions. Not a revenue recovery guarantee."*

8. **Continuous Watchdog (24/7 Monitoring)**:
   - Explains the 5-stage lifecycle: **Detect $\rightarrow$ Diff $\rightarrow$ Alert $\rightarrow$ Investigate $\rightarrow$ Verify**.

9. **Agency Operating Platform**:
   - Highlights supported agency capabilities: Multi-tenant client workspaces, branded PDF audit deliverables, monthly monitoring retainers, and Developer REST API.
   - Strictly excludes deferred/unshipped features (500-site autonomous prospect hunter, AI pitch generator, embeddable widgets).

10. **Transparent Pricing**:
    - Connected dynamically to `getPlans()` from `/billing/plans` with typed fallback.
    - Tier cards: Free Starter (₹0), Growth & Security Pro (₹4,999/mo), Agency & Consultant (₹14,999/mo), and Express Fix (₹2,999 one-time).

11. **Final Acquisition CTA**:
    - Secondary URL scanner input bar leading directly to free diagnostic flow.

12. **Footer**:
    - Regulatory links: Privacy Policy, Terms of Service, Cookie Policy, Refund Policy, and Sign In.

---

## 3. UI Component & Design System Reuse

All elements reuse the established LeadGuard design system:
- **Components**: [`Badge.tsx`](file:///home/mohit/Desktop/projects/leadguard%20project/leadgardosv6new%20top/apps/web/src/components/ui/Badge.tsx), [`ScoreRing.tsx`](file:///home/mohit/Desktop/projects/leadguard%20project/leadgardosv6new%20top/apps/web/src/components/ui/ScoreRing.tsx), [`Icons.tsx`](file:///home/mohit/Desktop/projects/leadguard%20project/leadgardosv6new%20top/apps/web/src/components/ui/Icons.tsx).
- **CSS Variables**: `var(--bg-app)`, `var(--bg-surface)`, `var(--bg-surface-elevated)`, `var(--border-color)`, `var(--primary)`, `var(--danger)`, `var(--warning)`, `var(--success)`, `var(--purple)`.
- **WCAG AA Compliance**: All text pairings verified to exceed 4.5:1 contrast ratios.

---

## 4. Responsive QA & Verification

Automated Playwright tests ([`scratch/homepage_browser_qa.mjs`](file:///home/mohit/Desktop/projects/leadguard%20project/leadgardosv6new%20top/scratch/homepage_browser_qa.mjs)) verified responsive rendering and horizontal overflow metrics across 4 canonical viewports:

| Viewport | Dimensions | Horizontal Overflow | Scroll Width | Client Width | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Desktop** | $1440 \times 900$ | **`false`** | 1440px | 1440px | ✅ **PASS** |
| **Laptop** | $1024 \times 900$ | **`false`** | 1024px | 1024px | ✅ **PASS** |
| **Tablet** | $768 \times 1024$ | **`false`** | 768px | 768px | ✅ **PASS** |
| **Mobile** | $375 \times 812$ | **`false`** | 375px | 375px | ✅ **PASS** |

### Screenshots Captured:
- `docs/screenshots/homepage_desktop.png` (Desktop 1440px)
- `docs/screenshots/homepage_laptop.png` (Laptop 1024px)
- `docs/screenshots/homepage_tablet.png` (Tablet 768px)
- `docs/screenshots/homepage_mobile.png` (Mobile 375px)

---

## 5. Verification Matrix

- [x] `npm run typecheck`: **PASS** (0 errors across all 7 workspace packages).
- [x] `npm run build --workspace @leadguard/web`: **PASS** (Vite production build succeeded in 4.22s).
- [x] `npx vitest run tests/pre-3b-remediation.test.ts`: **PASS** (13/13 unit tests passed).
- [x] Playwright Browser QA: **PASS** (Zero horizontal overflow at 375px; interactive calculator operational; sample banner verified).
- [x] Zero changes to backend routes, controllers, or database schemas.
- [x] Zero changes to authenticated screens (`DashboardView`, `AuditDetailView`, `MonitoringView`, etc.).

---

## 6. Deferred Work & Next Steps (Phase 3B-2)

Phase 3B-1 is strictly complete. The following items are deferred to **Phase 3B-2**:
1. Integration of hardened funnel analytics telemetry (`scan_start`, `scan_progress`, `result_viewed`).
2. Public scan progress UI state polish and polling optimization.
3. Registration/checkout conversion bridge refinement from scan results.
