# VaultGuard — Advanced Website Bug / Security Diagnostics

> **Status:** `IN_PROGRESS` (Phase A backend: scanners + registry + `VaultAuditFinding` table done; API surface pending)
> **Feature tree:** LeadGuard OS (leads) · RevenueShield (revenue) · **VaultGuard (security)**
> **Related docs:** `docs/AUDIT_ENGINE.md`, `docs/FEATURE_REGISTRY.md`, `docs/PHASE_3A6_PRE_3B_REMEDIATION_PLAN.md`

## ⬢ PROJECT MISSION (LeadGuard OS — ek line mein)

> **"Har Indian business ki website ka continuous bill of health — jis bhi din site se paisa, lead, ya security
> leak hota hai, LeadGuard OS usee din pakadta hai, fix guide deta hai, aur verified fix prove karta hai."**

Three pillars, one product family — same engine, same report, same subscription:

| Pillar | Product | Answer for the customer |
|---|---|---|
| **Leads** | LeadGuard | "Tumhari site leads leak kar rahi hai kahaan? Thik karo." |
| **Revenue** | RevenueShield | "Tumhara paisa (orders/checkout/billing) leak na ho." |
| **Security** | VaultGuard | "Bug (hackable exposure) kahaan hai — aur verified fix hai." |

**The why (a simple truth we bet on):** SMB websites par paisa aur data dono travel karte hain — lead forms, order
pages, admin panels — lekin almost kisi ke paas security check nahi hai. Ek hai health, ek hai security; dono ek
hi continuous diagnostic loop mein dete hain. VaultGuard us loop ka security engine hai.

## 1. What it is

An extension of the existing audit engine (`apps/worker/src/audit/*` + `packages/shared/src/scanners/*`) that turns
LeadGuard from a *lead/revenue* diagnostic into a **full website security & bug-finding product**. End users verify
ownership of their domain, run an audit, and get an actionable security score + prioritized findings with fix guidance
— the same classes of bugs found in external testing (prod debug mode, missing brute-force protection, expired
certs, PHP/version disclosure).

Real-world reference (passive/live recon done against an external site):
- Laravel/Ignition debug mode live in production → env key/db-credential leak + known RCE chain
- Login endpoint with no rate limiting → brute-force possible
- `X-Powered-By: PHP/8.4.24` header disclosure
- Expired SSL cert + TLS 1.1/CBC weak ciphers enabled

## 1b. Motivation — why we build this

**Problem:** India/SMB web ek security vacuum hai. Most small business websites have **zero** security controls
(misconfigured servers, debug modes on, expired certs, no brute-force protection) — aur unke paas koi nahi jo bata
sake. Pentest reports ₹50k–₹2L ke, 1–4 hafte lagte hain, aur jargon se bhare hain — SMB/agency ke liye unaffordable
aur unreadable. Lead leakage aur revenue pe toh product guard deta hai; security pe koi nahi.

**Belief:** Security ek *value-add service* hai, na ki scary cost center. Jo pehle se LeadGuard ke audit pipeline se
data aa raha hai (SSL, TLS, headers), wahi engine ek full security product bana sakta hai at near-zero marginal cost.

**Mission:** Har Indian SMB ke website ko ek verified-owned domain se passive, safe, instant "security floor check"
dein. Findings simple Hinglish mein — taaki agencies apne client ko value de sakein aur SMB owner ko bina professional
hacker ki fees ke pata chale ki uski site mein kaunse bugs hain.

**Why now:**
- Existing engine already detects SSL/TLS/headers → launch vector exists
- AI API already provisioned → remediation summaries are ~free
- Monitoring/BullMQ + entitlements + white-label reports already built → monetize today
- Security awareness spike post-Data Protection Act (DPDP 2023) → timing tailwind

## 1c. Business plan

### Target market (ICP)
| Segment | Who | How they buy | Value |
|---|---|---|---|
| **Digital marketing agencies** (primary) | Agencies already using LeadGuard (LG-011/013/016) | White-label resell to client | Margin + retention + "security included" pitch win |
| **Local SMBs / business owners** | LeadGuard Pro self-serve users | Self-serve monthly audit | Know before breach / before lead leak |
| **(future) Dev shops / freelancers** | React/WordPress/Laravel site builders | Per-project deliverable add-on | Post-build "security sign-off" |

### Revenue model (layered — reuse existing billing infra LG-017/019/020)
| Stream | Mechanics | Recurring? |
|---|---|---|
| **Subscription add-on tier** `LG-038` | Security Audit bolted onto existing Pro/Agency plans | Yes |
| **Credit packs** (LG-019) | one-time find credit + deep-scan purchases via existing checkout | No |
| **Monitoring subscription** | scheduled weekly security re-scan + regression alerts (Phase B) | Yes |
| **Agency white-label margin** | agency fixes their own markup on security reports (LG-006) | Via agency |

### Indicative price bands (₹/month, to validate)
| Tier | Scan model | Indicative |
|---|---|---|
| Free | header + SSL basic (1 site) | ₹0 |
| Pro add-on | Phase A scan + 1 retest + PDF report | ₹899–1,499 |
| Agency add-on | white-label + bulk sites + API + webhooks | ₹4,999+ or per-seat |
| Monitoring (Phase B) | weekly re-scan + alert + verified | ₹349/site/mo |

### Positioning & competition
| Who | Their model | VaultGuard edge |
|---|---|---|
| Traditional pentest firms | manual, expensive, 1–4 weeks | instant, automated, cheap, continuous |
| Generic scanners (nuclei/serp) | tech-only, no report/guidance | report + Hinglish fix + agency-integrated |
| Web agency dev hacks ("just add a header") | ad-hoc, no evidence | scored, evidence-backed, verified loop |

**Positioning:** "LeadGuard diagnostic = health; VaultGuard = security." One product family, one subscription story.

### Go-to-market
1. **Upsell rail:** "Security found X issues" box inside existing audit report + share link (network effect).
2. **Agency pitch fuel:** `LG-013` AI pitch auto-includes strongest security finding as pitch hook.
3. **Competitor radar tie-in (`LG-016`):** show "your competitor's site exposes debug mode" → fear-of-loss angle.
4. **Educational content:** "Is your site on the bug list every hacker can find?" — sample check demo (chrome only localhost) + optional verified-ownership demo on user's own domain.

### North-star metrics
- **Fixed findings per customer-month (verified)** — output-quality north star
- NDR (net-dollar retention) via monitoring renewals
- % of audited sites with ≥1 HIGH+ finding → proof-of-value for upsell copy
- Retest pass rate → validator of scanner calibration (keeps false positives near zero)

### Financial shape (illustrative, per customer)
- Pro add-on + monitoring ≈ ₹1,250–1,850/site/mo blended
- Gross margin ≈ 85%+ (infra = crawl + a few bytes; AI barely used)
- Break-even: 1–2 scans/hour of scanner development sustained demand (justifies Phase A first)

## 2. User flow (UI/UX)

```
Register domain → Verify ownership (DNS TXT or meta tag) → "Run Audit"
        → orchestrator pipeline (crawler → fetcher → scanners → aggregation)
        → Security dashboard (score + findings) → PDF/email report → Fix → Retest → "Verified"
```

- Ownership verification is the **legal gate**: scans are blocked until verified (Like Search Console).
- One click reuses the existing `orchestrator.ts` / `crawler.ts` / `fetcher.ts` pipeline.
- Dashboard gains a **Security tab**:

| State | UI |
|---|---|
| Not scanned | Empty state + "Run security audit" CTA |
| Scanning | Progress bar (crawl → probes → scoring), cancellable |
| Complete | Score card (0–100) + severity donut + finding list, sort by impact |
| Needs attention | Findings with ⚠️ CTAs: "Fix guide", "Download report", "Retest" |
| Verified | ✅ all findings retested-clean, next scheduled scan date |

## 3. Result the user gets

Existing data shapes fit — reuse `Finding`, `Severity`, `ScannerResult`, `ScoringContext`, `priority.ts`,
`business-impact.ts`, `evidence.ts`, and reports/outbox:

| Field | Example |
|---|---|
| normalizedIssueKey | `SEC_DEBUG_MODE`, `SEC_RATE_LIMIT`, `SEC_EXPIRED_CERT`, `SEC_SERVER_LEAK` |
| severity | critical / high / medium / low |
| affectedUrl / evidence | `https://site.com/_ignition/health-check` + HTTP response |
| why | "Production debug mode exposes env keys and enables known RCE chains." |
| recommendation | "Set `APP_DEBUG=false`; block `/_ignition/*` at the reverse proxy." |
| scoreImpact | number, integrated into `scoring.ts` category + overall 0–100 |

Deliverable: printable report (`LG-006`/`LG-007` share-link infra) + AI Hinglish remediation (reuse `AI_API_KEY`).

## 3b. Data model & scanner contract (design)

- Scanner = one module in `packages/shared/src/scanners`, implementing:

```ts
interface VaultScanner {
  key: 'SEC_DEBUG_EXPOSURE' | 'SEC_SSL_HEALTH' | 'SEC_AUTH_GUARD' | 'SEC_EXPOSED_ASSET';
  phase: 0 | 1; // 0 = page-level (crawler callback), 1 = host-level (one-shot)
  probe(ctx: ScannerContext): Promise<ScannerFinding[]>;
  // ScannerFinding = { normalizedIssueKey, severity, scoreImpact, evidence, affectedUrl, why, recommendation }
}
```

- Detection keys registry (single source of truth, mirrors `normalizedIssueKey` convention in Headers defs).
  Each key carries `{ cwe, hackeroneWeaknessLabel, cvssVectorTemplate, scoreImpact }` for HackerOne-style
  taxonomy + CVSS3.1 sizing (see §6c).
- Persistence: new table `VaultAuditFinding(id, audit_id, website_id, scanner_key, severity, status[OPEN|FIXED|VERIFIED_IGNORED], evidence_json, first_seen_at, last_seen_at)`.
- Scoring: security category score feeds existing overall health index; `scoreImpact` declared per detection key.
- Regulation: probes time-boxed (scan budget), fully parallel within crawled pages, no state mutation.

## 4. Tool advancement roadmap (VaultGuard)

### Phase A — Core bug detection scanners (MVP)
Definition of done: each scanner ships with a `tests/security/vaultguard-*.test.ts` + a fixture site showing at least
1 real positive; detections only from status codes/headers/bodies; zero false-positive on the fixture.

- [x] `debug-exposure` — `X-Powered-By`, debug headers, `.git`/`.env`/`.env.backup` probes, prod debug-mode markers
      (`/_ignition/health-check`, `/_debug`, stack-trace strings), version leak in body
- [x] `ssl-health` — cert expiry (days-left alert window), TLS 1.0/1.1, weak CBC suites, HSTS missing/short max-age
- [x] `auth-guard` — discovered login forms: throttle presence (`429`/`Retry-After`), CSRF token presence, cookie
      `HttpOnly`/`Secure`/`SameSite` flags
- [x] `exposed-asset` — directory listing, backup/zip/log files, source map leak
- [x] extend `security-headers` — CSP report, permissions-policy, malformed/duplicated header values

### Phase B — Product-level intelligence
- Business-impact weighting (lead form/checkout assets weigh higher) via `business-impact.ts` + `priority.ts`
- Retest loop → `VERIFIED` status (regression detection reuse from `LG-009`) + per-finding "ignore & reason" audit
- AI remediation summaries (existing `AI_API_KEY`) → Hinglish explain + fix steps, cached per detection key
- Scheduled re-scans via BullMQ worker + alert when a new/fixed finding transitions (reuse monitoring pipeline)

### Phase C — Advanced coverage
- API surface discovery: robots.txt, sitemap, common admin/api path catalog, endpoint enumeration (read-only)
- Tech-stack fingerprinting → lean CVE lookup (offline advisory bundle, refresh nightly; no live internet dependency)
- Authenticated scans via Playwright E2E workers, **only with customer-provided test account** (opt-in)
- Optional nuclei sidecar (Docker `projectdiscovery/nuclei`) for deep scans — throttled, scoped, host-only templates

## 5. Project advancement (architecture & product)

- Unified typed scanner registry — adding a scanner = one file + one registry row; auto-picked by pipeline
- Incremental crawling + Redis caching for scan speed; tuple pagination for long result sets (`LG-026`)
- Observability on `telemetry.ts`; security events to admin audit trail (`LG-033`)
- CI: new `security` job in `.github/workflows/ci.yml` → `tests/security/*` + localhost nuclei smoke scan
- Product packaging: `LG-038` gated behind `LG-020` entitlements; `security.audit.completed` webhook event
  (`LG-021`/`LG-022`); white-label report variant reuse (`LG-006`/`LG-007`)

## 5b. API surface additions

| Method | Route | Purpose |
|---|---|---|
| POST | `/websites/:id/security-audit` | Kick off VaultGuard scan (respects concurrency/quota) |
| GET | `/websites/:id/security-audit` | Latest result: score + finding summary |
| GET | `/websites/:id/security-audit/findings` | Paginated (tuple cursor `LG-026`), filter by severity/status |
| POST | `/websites/:id/security-audit/retest` | Re-run only OPEN findings (cheaper, faster) |
| PATCH | `/security-audit/findings/:id` | Mark `VERIFIED_IGNORED` with reason (audited) |
| GET | `/security-audit/findings/:id/evidence` | Raw evidence blob (response headers/body excerpt) |

## 6. Legal & safety guardrails (non-negotiable)

1. Scan **only verified-owned** domains (DNS TXT / meta-tag proof) + explicit ToS consent.
2. Passive-first; light-active probes only (status code + header analysis). **Never exploit.**
3. Globally throttled + time-boxed scans; hard SSRF block (reuse `LG-028` validator: loopback/private/cloud-metadata).
4. No real-user PII collection during scans; mock/test credentials only.
5. No destructive actions (no data mutation, no DoS-capable payloads).

## 6b. Market proof — Meesho precedent (HackerOne `meesho_bbp`)

Real-world evidence (tested under Meesho's authorized HackerOne program; private since 2025, public since Feb 2026).
The same bug classes reported on a large e-commerce marketplace exist in junk form on the small-business websites
LeadGuard/VaultGuard targets — sites that usually have **zero** security controls.

| Bug class | Fully automatable in VaultGuard? | How |
|---|---|---|
| Misconfig / server exposure (debug mode, version headers, `.env`/`.git`) | ✅ Yes (passive/light) | `debug-exposure` scanner |
| SSL/TLS health (expired cert, TLS1.0/1.1, weak ciphers) | ✅ Yes | `ssl-health` scanner |
| Missing security headers / cookie flags | ✅ Yes | `security-headers` extension |
| Tech stack + versioned CVE lookup | ✅ Yes | fingerprint + advisory DB |
| Login brute-force exposure (no throttle) | ✅ Yes (light) | `auth-guard` throttle probe |
| Exposed admin/API surfaces | ⚠️ Partial | robots.txt + path discovery (recon catalog) |
| IDOR / object-level authz, price manipulation, OTP/email-confirmation takeover chains | ❌ No (needs manual/authenticated testing with test accounts) | Out of automated scope — "deep assessment" upsell |

**Positioning lesson:** VaultGuard sells the *automated security floor* (config/misconfig/exposure bugs — the ones
that dominate small sites). E-commerce-depth bugs (IDOR, business logic, ATO chains) need logged-in manual testing
and are **not promised by automated scans** — keeps it legal + honest. Optional later: authenticated Playwright
checks with customer-provided **test accounts only**, opt-in.

**Community note:** Big e-commerce programs triage aggressively (closed N/A, reputation hits happen). Never run
these techniques against arbitrary third-party sites — only via authorized programs. VaultGuard stays strictly
passive/light on customer domains.

## 6c. HackerOne methodology adoption (into VaultGuard)

Make every VaultGuard finding look and behave like a well-written HackerOne report — because that IS the industry
standard a bug report should meet, and it transfers directly to a customer's own pentest/audit needs.

### 1. Weakness taxonomy — map detection keys to CWE
HackerOne classifies every report by CWE. Do the same so findings are interoperable (and exportable to
remediation/bug-tracking tools). Each detection key carries `cwe` + `hackeroneWeaknessLabel`.

| VaultGuard detection key | CWE |
|---|---|
| `SEC_DEBUG_MODE` / `.env` / stack trace | CWE-200 Exp . exposure; CWE-489 Active Debug Code |
| `SEC_SERVER_LEAK` (X-Powered-By / version) | CWE-200 |
| `SEC_EXPIRED_CERT` / TLS1.0-1.1 / weak ciphers | CWE-295 Improper Certificate Validation; CWE-327 Broken Crypto |
| `SEC_MISSING_HSTS` / headers | CWE-693 Protection Mechanism Failure; CWE-352 (CSRF, missing tokens) |
| `SEC_RATE_LIMIT` (no throttle) | CWE-307 Improper Restriction of Excessive Auth Attempts |
| `SEC_EXPOSED_ADMIN` / backup files / listing | CWE-16 Configuration; CWE-530 Exposure of Backup File |
| deprecated raw payload issues (future) | CWE-79 XSS, CWE-89 SQLi, CWE-284 Access Control |

### 2. Severity = CVSS 3.1, not guesswork
- Compute a CVSS3.1 vector per finding from probe facts (attack vector=network, complexity, no privileges needed,
  low/high impact, no scope change) → derive severity rating.
- Severity caps for light-active scans: **never** rate above High without deep/confirmed evidence; label such items
  "suspected — needs manual verify" (reduces false-severity, mirrors HackerOne's "informative" discipline).
- `priority.ts` weight = CVSS severity × business impact (not raw count).

### 3. Report structure = the HackerOne format
Adopt F = finding as a mini-report so the customer can reuse it directly:

```
[Finding]  Asset – Vulnerability Type – Impact
  Summary   (what + why it matters, business risk)
  Steps     (exact request + response captured in evidence.json)
  Impact    (what an attacker achieves, attacker-visible CVSS)
  Mitigation (fix steps; AI-augmented Hinglish)
```

### 4. Triage lifecycle — borrow HackerOne's states
VaultGuard finding status mirrors a bounty report lifecycle:

`OPEN → TRIAGED (auto-validated by retest probe) → FIXED → VERIFIED` + `VERIFIED_IGNORED` (with reason) + optional
`DISCLOSED` timeline for municipalities/customers who want public transparency after fix.

### 5. Quality bar (bounty-grade discipline)
- Clear scope match (verified-owned domain only)
- Clean reproduction — evidence snapshots auto-collected; no manual typing
- Material impact — finding is dropped if its CVSS+impact fails a threshold (keeps NDR: never spam the customer)
- False-positive calibration: fixture-based DoD per scanner (Phase A DoD), plus a "precision score" per detection key
  from retest pass rate (like HackerOne researcher accuracy)

### 6. Bounty-driven prioritization insight
What pays highest on HackerOne (RCE > IDOR/ATO > XSS > CSRF > info-disclosure/misconfig) dictates what to surface
first. For SMBs the *realized* order flips because exploit depth is low but frequency is high: **misconfig &
exposure → auth issues → data exposure**. VaultGuard ranking = severity weight × frequency on small sites, so the
customer fixes the bugs that actually get exploited against them first.

## 7. Backlog, tracker & effort

### Tracker row

| Feature ID | Feature Name | Status | Test Suite | Notes |
|---|---|:---:|---|---|
| **LG-038** | VaultGuard Security Audit | `IN_PROGRESS` | `tests/security/vaultguard-*.test.ts` | Phase A scanners + registry + `VaultAuditFinding` table done; §5b API surface pending |
| **LG-039** | VaultGuard AI Remediation | `PLANNED` | `tests/security/vaultguard-remediation.test.ts` | Cached Hinglish fix-guidance per detection key |
| **LG-040** | VaultGuard Retest & Verified Loop | `PLANNED` | `tests/security/vaultguard-retest.test.ts` | OPEN-finding re-run + status transitions + ignore-audit |

### Effort (rough, engineering days)

| Item | Est. |
|---|---|
| Phase A (5 scanners + registry + table + fixtures) | 8–12 |
| Phase B (impact weighting + retest + AI + scheduling) | 6–9 |
| Phase C (API discovery, CVE bundle, playwright auth, nuclei sidecar) | 10–15 |
| UX + API + entitlements + webhooks + CI security job | 5–7 |

### Risks & mitigations

| Risk | Mitigation |
|---|---|
| False positives destroy trust | Fixture-based DoD per scanner; severity caps on light probes |
| Scan abuse / legal exposure | Ownership gate + throttle + SSRF validator + ToS consent |
| AI remediation hallucination | Detect-key-templated suggestions with validation (reuse `claim-validator.ts` style) |
| Scheduler spam | Entitlement quota + webhook dedupe via outbox |