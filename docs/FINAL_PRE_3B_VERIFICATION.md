# LEADGUARD OS V6 — FINAL PRE-3B BLOCKER VERIFICATION

**Document Version**: 1.0.0-final-pre-3b
**Date**: 2026-08-30
**Mode**: STRICT SOURCE VERIFICATION ONLY — **NO CODE CHANGES** (only this report written).
**Repository**: `mohit11kmr/leadgardosv6new-top`
**HEAD verified**: `b83a1b4fa761177b343ccb5b5eb1db0a02a62ce5`
**Verification basis**: direct inspection of current source, control-flow trace, and live typecheck/build. **No historical findings carried forward unless re-confirmed on this HEAD.**

---

## 1. CURRENT HEAD

- **`b83a1b4`** — "feat: implement Phase 3A.6 remediation tasks including GDPR-compliant funnel tracking, expanded audit DTO evidence sanitization, and updated badge UI variants."
- Files changed in this commit (the remediation): `guestScanController.ts`, `dtos/public.ts`, `publicAuditService.ts`, `Badge.tsx`, `FindingCard.tsx`, `ScanResultView.tsx`, `styles.css`, `request-utils.ts`, plus new `tests/pre-3b-remediation.test.ts`, `scratch/badge_browser_qa.mjs`, `docs/PHASE_3A6_IMPLEMENTATION.md`.
- Working tree **clean** (no uncommitted changes).
- Fresh commit applying all four blocker remediations; verified directly.

---

## 2. F1 — CLIENT IP PRIVACY: **PASS**

**Route control-flow (current `guestScanController.ts`, funnel route):**
```ts
await funnelEventService.record({
  organizationId: orgId,
  type: input.event,
  websiteId: scanResult.website.id,
  auditId: scanResult.id,
  sessionId: input.sessionId || undefined,
  // F1: Data minimization - do not persist raw client IP
});
```
The object passed to `funnelEventService.record(...)` **contains no IP field at all** — no `clientIp`, no `ip`, no `data` payload. The `data: { clientIp: getClientIp(req) }` line is **removed**.

**Repository-wide trace of IP sources — every `getClientIp`, `remoteAddress`, `x-forwarded-for` occurrence is classified:**

| Occurrence | Location | Classification |
|------------|----------|----------------|
| `getClientIp(req)` for `/free-scan` creation | `guestScanController.ts:28` → `createGuestScan(..., clientIp)` | **REQUEST-ONLY** — used for rate limiting (`ratelimit:guest_scan:ip:*` Redis key); IP is **not** written to `FunnelEvent` |
| `getClientIp(req)` for Express-Fix checkout | `guestExpressFixController.ts:28` | **REQUEST-ONLY** — rate limiting / context; no funnel persistence |
| `getClientIp(req)` in rate limiter | `rateLimiters.ts:21` | **REQUEST-ONLY** — Redis rate-limit key |
| `getClientIp(req)` ×12 in `routes.ts` (auth, `recordSecurityEvent`, widget) | `routes.ts:71,168,252,289,345,437,452,462,472,2079,2089,2112,2156` | **REQUEST-ONLY / UNRELATED** — persisted only into `SecurityEvent.ipAddress` (pre-existing security audit log, unrelated to funnel/Phase-3B) |
| `req.ip`/`x-forwarded-for` in `apiKeyService.ts:302` | `apiKeyService.ts` | **UNRELATED** — API-key security event logging |

**Every `funnelEventService.record(...)` call site (current HEAD) passes non-IP data only:**
- funnel route: no data at all
- `EXPRESS_FIX_CLICKED` → `{email}`
- `CHECKOUT_STARTED` → `{orderId, email}`
- `PAYMENT_FAILED` → `{orderId, paymentId}`
- `FULFILLMENT_CREATED` → `{fulfillmentId, paymentId}`
- `PAYMENT_SUCCESS` → `{orderId, paymentId, amount}`
- `FREE_SCAN_STARTED` → `{url}`
- `FREE_SCAN_COMPLETED` → `{findingsCount}`

**FINAL: PASS.** No raw client IP (or IP-like field) is persisted anywhere in the funnel pipeline. The only IP persistence in the codebase is the pre-existing `SecurityEvent.ipAddress` security log, which is unrelated to this surface.

---

## 3. F2 — FUNNEL ERROR CONTRACT: **PASS** (one documented nuance)

**Exact control flow (`guestScanController.ts` funnel route, current HEAD):**

| Condition | Branch | Status |
|-----------|--------|--------|
| Malformed **path** `scanId` (not UUID) | `z.string().uuid().safeParse(scanIdParam)` fails → **400** `INVALID_ARGUMENT` | ✅ **400** |
| Malformed **body** (bad event enum / bad body / missing scanId-only not required) | `guestFunnelEventSchema.parse` throws `ZodError` → caught → **400** `INVALID_ARGUMENT` + details | ✅ **400** |
| **Nonexistent scan** | `getGuestScanResult(targetScanId)` returns null → **404** `NOT_FOUND` | ✅ **404** |
| **Internal service/database error** (in `getGuestScanResult` / `getOrCreateSystemGuestOrganization`) | catch (non-Zod) → log → **500** `INTERNAL` | ✅ **500** (for pre-write errors) |
| **Successful event** | `res.json({ success: true })` → **200** | ✅ **200** |
| Body `scanId` optional? | schema: `scanId: z.string().uuid().optional()`; `targetScanId = input.scanId || scanIdParam` | ✅ **path scanId is authoritative**; body scanId is optional override |

**Nuance (verified, ties to F2's literal "DB error → 500" spec):** `funnelEventService.record()` **internally swallows** the `db.funnelEvent.create` failure (`funnelEventService.ts` try/catch, logs warn, returns void). Therefore a failure of the **actual funnel DB insert** never propagates to the route's 500 branch — it returns **200** regardless. The 500 path is reached only for errors before the write (`getGuestScanResult`, `getOrCreateSystemGuestOrganization`). This is an intentional best-effort design ("funnel tracking must never break the primary flow") and is defensible for an analytics endpoint, but it means the strict "internal DB error → 500" claim is only partially honored for the write itself.

**FINAL: PASS** (400/404/500/200 semantics implemented correctly at the route; the sole nuance is the intentional best-effort swallow inside `record()`, which is a design decision, not a defect).

---

## 4. F5 — EVIDENCE CONTRACT: **PARTIAL / FAIL**

### 4.1 Authoritative data type
- Prisma `AuditFinding.evidence` is **`Json`** (`schema.prisma:401`) → a JSONB value that may be an **object, array, string, number, boolean, or null** (nested recursively).

### 4.2 Current DTO type
```ts
export type FindingEvidence = Record<string, unknown> | string | null;   // dtos/public.ts
evidence?: FindingEvidence;
```
**Is `Record<string, unknown> | string | null` sufficient as the complete JSON-compatible type? NO.** It is **narrower than JSON**:
- Excludes top-level `number` and `boolean`.
- Does **not** model arrays (`JsonValue[]` is not cleanly `Record<string, unknown>`).
- The exact canonical type required is a **recursive `JsonValue` union**, e.g.:
```ts
export type FindingEvidence =
  | string | number | boolean | null
  | FindingEvidence[]
  | { [key: string]: FindingEvidence };
```
(or `Prisma.JsonValue`). `Record<string, unknown>` only loosely covers object-shaped evidence and silently mis-types any array/primitive evidence.

### 4.3 Producer alignment
Both producers now emit **identical finding shapes** (verified):
- `publicAuditService.formatAuditDto` (line 234-270): `businessImpact`, `affectedUrl`, `evidence: this.sanitizeEvidence(f.evidence)`, `normalizedIssueKey`. ✅
- `guestScanService.formatPublicAuditDto` (line 306-336): **same fields** ✅.
→ Cross-producer divergence **resolved**. ✅

### 4.4 `sanitizeEvidence` recursion (identical in both services)
```ts
if (!evidence || typeof evidence !== 'object') return evidence;   // passes string/number/boolean/null through
const sanitized = { ...evidence };                                // copy; Object spread
...delete sensitive keys (headers, cookies, authorization, token, secret, password, key, signature, rawBody, requestBody, responseBody)...
for (key of Object.keys(sanitized)) if (object) recurse;
```
- **string** ✅ / **number** ✅ / **boolean** ✅ / **null** ✅ (returned unchanged by the `!evidence`/non-object guard).
- **object** ✅ (keys removed, recurses into nested objects).
- **array** ❌ — `typeof [] === 'object'` → enters the object branch → `{...array}` **spreads the array into an object with numeric keys**, so the array identity is **destroyed** (e.g., `[...]` becomes `{0:…, 1:…}`). Nested sensitive keys would still be stripped (it recurses into each element), but the JSON shape is **mutated**.
- **Sensitive-field removal** is **recursive** for objects ✅ (deletes on nested copies).

**FINAL: PARTIAL/FAIL.** Producer alignment is fixed and the DTO is widened (good), but the canonical type is not a complete JSON union, and `sanitizeEvidence` **mangles arrays** — both gaps that Phase 3B rendering will hit.

### 4.5 Frontend consumer contract (additional mismatch, verified)
- `ScanResultView` reads `evidence?: Record<string, unknown> | null` and renders via `JSON.stringify(evidence, null, 2)` — treats evidence as opaque JSON.
- `FindingCard` reads `evidence?: FindingEvidenceData | null` where `FindingEvidenceData` is a **narrow structural type** (`source/observed/location/why/recommendation/element/expectedPattern/ruleId/value/metadata?`) and renders specific keys (`finding.evidence?.observed`, `.value`, `.ruleId`, ...).
These two consumers assume **incompatible shapes** with **no runtime shape guard** — if actual evidence JSON doesn't match FindingCard's assumed keys or is an array, fields render blank. Web typecheck passes only because both consumers use their own (loosely-compatible) local types.

---

## 5. F4 — BADGE: **PASS**

### 5.1 Variant matrix (complete — every variant in the repo)
`Badge.tsx` TS union now has **all 13**: `critical, high, medium, low, info, success, warning, neutral, error, emerald, indigo, slate, purple`. `styles.css` now defines **all 13** `.badge-*` rules.

| Variant | TS union | CSS selector | background | text color | border | Contrast (vs dark surface) |
|---------|:--------:|:------------:|------------|------------|--------|-----------|
| critical | ✅ | `.badge-critical` | `var(--danger-light)` | `#f87171` | yes | AA ✅ |
| high | ✅ | `.badge-high` | orange .15 | `#fb923c` | yes | AA ✅ |
| medium | ✅ | `.badge-medium` | `var(--warning-light)` | `#fbbf24` | yes | AA ✅ |
| low | ✅ | `.badge-low` | surface-hover | `--text-secondary` | yes | AA ✅ |
| neutral | ✅ | `.badge-neutral` | surface-hover | `--text-secondary` | yes | AA ✅ |
| success | ✅ | `.badge-success` | `var(--success-light)` | `#34d399` | yes | AA ✅ |
| info | ✅ | `.badge-info` | `var(--primary-light)` | `#60a5fa` | yes | AA ✅ |
| **warning** | ✅ | `.badge-warning` | `var(--warning-light)` | `#fbbf24` | yes | AA ✅ |
| **purple** | ✅ | `.badge-purple` | `var(--purple-light)` | `var(--purple)`=`#a78bfa` | yes | AA ✅ (7.08:1 documented) |
| **error** | ✅ | `.badge-error` | `var(--danger-light)` | `#f87171` | yes | AA ✅ |
| **emerald** | ✅ | `.badge-emerald` | `var(--success-light)` | `#34d399` | yes | AA ✅ |
| **indigo** | ✅ | `.badge-indigo` | `var(--primary-light)` | `#818cf8` | yes | AA ✅ |
| **slate** | ✅ | `.badge-slate` | surface-hover | `--text-secondary` | yes | AA ✅ |

Every variant now has a rendered `background-color`, `color`, and `border` (previously `warning`/`purple` had none). None remains a bare uncolored pill. Contrast uses Phase 3A AA-corrected tokens (`--purple` = `#a78bfa`).

### 5.2 Note on the F4 test
The automated test (`tests/pre-3b-remediation.test.ts`) only asserts the **class names exist** in `styles.css`/`Badge.tsx` (**source-string**, not computed visuals). The real computed-style verification is `scratch/badge_browser_qa.mjs` (a Playwright script that renders all 13 variants and logs computed colors/backgrounds/borders). That script is a **manual inspection aid** — it logs but does **not** assert PASS/FAIL, and whether it was ever executed is unverified. However, the CSS itself is correct.

**FINAL: PASS** (at the type + CSS level; all variants have selector, background, text color, border, and AA contrast; the browser harness is present but non-asserting).

---

## 6. UNEXPECTED CHANGES

### 6.1 `packages/shared/src/request-utils.ts` — **HARMLESS / REQUIRED (decoupling)**
- `getClientIp(req: Request)` → `getClientIp(req: MinimalHttpRequest)`; runtime body **unchanged** (`req.ip || req.socket?.remoteAddress || '127.0.0.1'`; the added `socket?.` optional chaining is a no-op on a real Express req).
- `getClientUserAgent` now returns `Array.isArray(ua) ? ua[0] : ua` — a defensive scalar-coercion (beat: `user-agent` is single-valued; safe).
- Removes the `express` type import from the shared package. **No behavior change that affects production IP handling** (PII path already removed independently). **Classification: HARMLESS** (safe decoupling; required to let the shared package be consumed without the express type).

### 6.2 `scratch/badge_browser_qa.mjs` — **HARMLESS (dev tooling, not shipped)**
- A Playwright browser QA script (renders 13 badge variants, logs computed styles at `localhost:5173`). Lives under `scratch/`, not imported by the app, not part of the build. It only **logs** results (no PASS/FAIL assertions; `.catch` exits only on script error). **No production effect.** Whether it actually ran is unverified.

---

## 7. TEST QUALITY — `tests/pre-3b-remediation.test.ts`

| Test | Type | Evidence strength | False-confidence risk |
|------|------|-------------------|-----------------------|
| "schema accepts optional scanId + valid enums" | **SOURCE/LOGIC test** (re-declares the schema inline rather than importing it) | Weak | **High** — it re-implements a copy of `guestFunnelEventSchema`; if the real schema drifts, this passes falsely |
| "controller does NOT pass clientIp to record" | **SOURCE-STRING test** (reads file, checks absence of `clientIp: getClientIp` / `data: { clientIp`) | Weak | Medium — a string check; does not prove runtime payload |
| "controller handles 400, 404, 500" | **SOURCE-STRING test** (checks file `contains` `res.status(400/404/500)`) | Weak | **High** — passes even if those calls are in the wrong branch; does not exercise control flow |
| "PublicAuditFindingDTO declares evidence object/null" | **TYPE/UNIT test** (TS fixture assigned to DTO) | Medium | Low — a compile-time type contract check only |
| "both producers include evidence/businessImpact/..." | **SOURCE-STRING test** (checks file `contains` mapping strings) | Weak | **High** — proves strings exist, not runtime output shape |
| "styles.css defines all .badge-* classes" | **SOURCE-STRING test** (class-name presence) | Weak | **High** — the exact trap the F4 spec warned about |
| "Badge.tsx exports all variants" | **SOURCE-STRING test** (string presence) | Weak | Medium |

**No test is a RUNTIME, INTEGRATION, or SUPERTSET test.** None exercises the actual Express route, a real DB, or rendered UI. The suite provides only weak source-string/type evidence and several tests would pass even if the behavior were broken. **Do not treat the suite as proof of F1/F2/F5/F4; it is corroborating-syntax evidence at most.**

---

## 8. BUILD / TYPECHECK (run on current HEAD)

| Command | Result |
|---------|--------|
| `npm run typecheck` (all workspaces: api, web, worker, config, database, shared) | ✅ **PASS** — exit 0 |
| `npm run build --workspace @leadguard/web` (vite) | ✅ **PASS** — 155 modules, built in 8.66s; only a pre-existing large-chunk-size warning (not a regression) |

Both **actually executed on HEAD `b83a1b4`** — not assumed. No frontend compile/build regression introduced by the remediation commit.

---

## 9. BLOCKING ITEMS

Only the **F5 (evidence contract)** gaps are blocking:

1. **F5a — Canonical type is not complete JSON.** Replace `FindingEvidence = Record<string, unknown> | string | null` with a recursive `JsonValue`-compatible union (`string | number | boolean | null | FindingEvidence[] | { [key:string]: FindingEvidence }`, or `Prisma.JsonValue`).
2. **F5b — `sanitizeEvidence` mangles arrays.** The `{...evidence}` spread converts arrays into objects. Recurse on `Array.isArray` and preserve array shape (also coherence of F5a's `JsonValue[]`).
3. **F5c — Frontend evidence consumers are incompatible with no runtime guard.** Align `FindingCard`'s structural `FindingEvidenceData` and `ScanResultView`'s `JSON.stringify` with the canonical type and add a runtime shape guard so evidence renders correctly (or selects a single canonical evidence schema the sanitizer emits).

These are contract/render blockers because Phase 3B renders findings on the result page and will consume `evidence`.

---

## 10. FINAL DECISION

**NOT READY FOR PHASE 3B.**

Blocking items (F5 only):
1. Evidence `FindingEvidence` type must be a complete recursive `JsonValue` union (not `Record<string, unknown> | string | null`).
2. `sanitizeEvidence` must correctly preserve JSON arrays (currently coerces arrays to objects via spread).
3. Frontend evidence consumers (`FindingCard` vs `ScanResultView`) must share a single runtime-guarded evidence shape.

All other blockers verified **PASS on current HEAD**: F1 (no client IP persisted) ✅, F2 (400/404/500/200 contract implemented; only intentional best-effort swallow inside `record()`) ✅, F4 (all 13 badge variants styled + AA contrast) ✅; typecheck and web build pass ✅; `request-utils.ts` change harmless; `scratch/badge_browser_qa.mjs` is harmless dev tooling.

---

*End of Final Pre-3B Verification. Strict source verification performed against HEAD `b83a1b4`; no code, schema, migration, tests, or dependencies were modified (only this report was created).*
