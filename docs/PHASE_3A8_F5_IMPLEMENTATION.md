# LEADGUARD OS V6 — PHASE 3A.8 F5 EVIDENCE CONTRACT REMEDIATION

**Document Version**: 1.0.0-phase3a8  
**Date**: 2026-08-30  
**Mode**: TARGETED IMPLEMENTATION ONLY (Phase 3A.8)  
**Repository**: `mohit11kmr/leadgardosv6new-top`  
**Status**: **PASS** (F5 blocker fully resolved)

---

## 1. Executive Summary & Root Cause Analysis

### 1.1 Root Cause
In Phase 3A.6, the audit finding evidence contract suffered from three structural defects:
1. **Incomplete Public Type Contract**: `FindingEvidence` was declared as `Record<string, unknown> | string | null`, which rejected top-level JSON primitives (`number`, `boolean`), did not accurately model JSON arrays (`JsonValue[]`), and diverged from Prisma's native `Json` capability.
2. **Unsafe Array Sanitization**: `sanitizeEvidence` in `publicAuditService.ts` and `guestScanService.ts` used `{ ...evidence }` object spreading. Because `typeof [] === 'object'`, arrays entering the sanitizer were coerced into plain objects with numeric string keys (`{ 0: ..., 1: ... }`), corrupting array ordering and structure.
3. **Incompatible Frontend Consumers & Missing Runtime Guard**: `FindingCard` assumed a rigid internal shape (`FindingEvidenceData` with specific diagnostic properties) while `ScanResultView` rendered raw JSON, leading to blank rendering or potential `[object Object]` corruptions for non-object/array evidence without a runtime guard.

### 1.2 Phase 3A.8 Remediation Objective
Establish:
- **One Canonical JSON-Safe Evidence Type** across shared, API DTOs, and frontend packages.
- **One Canonical Sanitization Implementation** that recursively protects sensitive fields while strictly preserving JSON primitives, array ordering, objects, and nulls without mutation.
- **One Canonical Frontend Runtime Normalization Guard & Rendering Pipeline** safely handling objects, arrays, primitives, and null states.

---

## 2. Canonical JSON-Safe Types (`@leadguard/shared`)

Implemented in `packages/shared/src/evidence.ts` and re-exported throughout the workspace:

```ts
export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

export type FindingEvidence = JsonValue;
```

### Key Properties:
- Truly recursive JSON-compatible type.
- Zero `any` or loose `Record<string, unknown>` types in the public contract.
- Fully compatible with TypeScript's exact optional property definitions and Prisma's `Json` type.

---

## 3. Canonical Sanitizer Implementation

Implemented in `packages/shared/src/evidence.ts`:

```ts
export const SENSITIVE_EVIDENCE_KEYS = new Set([
  'headers',
  'cookies',
  'authorization',
  'token',
  'secret',
  'password',
  'key',
  'signature',
  'rawbody',
  'requestbody',
  'responsebody',
]);

export function sanitizeFindingEvidence(evidence: unknown): FindingEvidence {
  if (evidence === null || evidence === undefined) {
    return null;
  }

  if (typeof evidence === 'string' || typeof evidence === 'number' || typeof evidence === 'boolean') {
    return evidence;
  }

  if (Array.isArray(evidence)) {
    return evidence.map((item) => sanitizeFindingEvidence(item));
  }

  if (typeof evidence === 'object') {
    const sanitized: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(evidence as Record<string, unknown>)) {
      if (!SENSITIVE_EVIDENCE_KEYS.has(k.toLowerCase())) {
        sanitized[k] = sanitizeFindingEvidence(v);
      }
    }
    return sanitized;
  }

  try {
    return String(evidence);
  } catch {
    return null;
  }
}
```

### Safety & Structural Invariants:
- **Preserves Array Identities**: Uses `Array.isArray(evidence)` and `.map()` to preserve array types and exact index ordering.
- **Recursive Key Redaction**: Recursively strips all 11 forbidden keys (`headers`, `cookies`, `authorization`, `token`, `secret`, `password`, `key`, `signature`, `rawBody`, `requestBody`, `responseBody`) case-insensitively across nested objects and nested arrays.
- **Immutability**: Never mutates the source input; constructs fresh arrays and objects.
- **Resilience**: Never throws on malformed or exotic values (functions/symbols/bigints safely coerced or mapped to null).

---

## 4. Producer Alignment

Both public DTO producers (`publicAuditService.ts` and `guestScanService.ts`) now use the canonical `sanitizeFindingEvidence` and emit the exact 11-field finding structure:

```ts
findings: audit.findings.map((f: any) => ({
  id: f.id,
  title: f.title,
  description: f.description,
  category: f.category,
  severity: f.severity,
  scoreImpact: f.scoreImpact,
  recommendation: f.recommendation,
  businessImpact: f.businessImpact || null,
  affectedUrl: f.affectedUrl || null,
  evidence: this.sanitizeEvidence(f.evidence),
  normalizedIssueKey: f.normalizedIssueKey,
}))
```

---

## 5. Frontend Runtime Guard & Consumer Alignment

### 5.1 Normalization Guard (`normalizeFindingEvidence`)
A defensive runtime function guaranteeing valid `JsonValue | null` for external/network API data:

```ts
export function normalizeFindingEvidence(value: unknown): JsonValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => normalizeFindingEvidence(item));
  if (typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = normalizeFindingEvidence(v);
    }
    return result;
  }
  try {
    return String(value);
  } catch {
    return null;
  }
}
```

### 5.2 `FindingCard.tsx` Refactoring
- Consumes `finding.evidence?: FindingEvidence | null`.
- Uses `normalizeFindingEvidence` at runtime.
- Multi-shape rendering:
  - **Object**: Renders known diagnostic keys (`ruleId`, `location`, `observed`, `why`, `source`, `element`, `expectedPattern`, `value`, `recommendation`) with clear typography and color accents, followed by any additional metadata entries.
  - **Array**: Renders structured item cards without crashing or producing `[object Object]`.
  - **Primitive**: Renders clean textual value.
  - **Null/Unavailable**: Shows safe fallback message.

### 5.3 `ScanResultView.tsx` Refactoring
- Aligned `ScanResult` interface with `FindingEvidence`.
- Uses `normalizeFindingEvidence` to format nested technical evidence safely in formatted collapsible code views without crashing or leaking secrets.

---

## 6. Verification Results

### 6.1 Automated Vitest Test Suite (`tests/pre-3b-remediation.test.ts`)
- **13/13 unit tests passed** (100% real behavioral tests):
  - A. Primitive evidence (string, number, boolean, null, undefined)
  - B. Object evidence (clean nested object replication without mutation)
  - C. Array evidence (primitives preservation, array of objects preservation, exact ordering)
  - D. Mixed nested JSON (objects in arrays, arrays in objects, nested matrices)
  - E. Sensitive field removal (all 11 keys stripped across top-level, nested objects, and nested arrays)
  - F. DTO producer consistency (`publicAuditService` vs `guestScanService` parity check)
  - G. Frontend normalization runtime guard validation

### 6.2 Workspace Typecheck
- Command: `npm run typecheck`
- Workspaces: `@leadguard/api`, `@leadguard/web`, `@leadguard/worker`, `@leadguard/config`, `@leadguard/database`, `@leadguard/shared`
- Result: **0 errors, exit code 0**

### 6.3 Web Bundle Build
- Command: `npm run build --workspace @leadguard/web`
- Result: **Vite build succeeded in 7.47s (185 modules transformed)**

### 6.4 Browser QA Verification
- Executed `scratch/evidence_browser_qa.mjs` against preview build on Chromium headless.
- Result: **0 console errors, clean DOM mount and title verification.**

---

## 7. Backward Compatibility & Limitations

- **Backward Compatibility**: Fully preserved. Existing structured scanner evidence objects continue to render their standard diagnostic keys (`ruleId`, `observed`, `location`, etc.) while array-based and primitive evidence now render without distortion or coercion.
- **Remaining Limitations**: None for F5. Database schema, billing logic, and public API endpoint signatures were untouched.

---

## 8. Summary of Files Changed

| File | Status | Description |
|------|--------|-------------|
| `packages/shared/src/evidence.ts` | **NEW** | Canonical recursive `JsonValue` type, `sanitizeFindingEvidence`, `normalizeFindingEvidence` |
| `packages/shared/src/index.ts` | **MODIFIED** | Re-exported `evidence.js` |
| `packages/shared/src/types.ts` | **MODIFIED** | Updated `Finding.evidence` typing and structured evidence interface |
| `apps/api/src/dtos/public.ts` | **MODIFIED** | Exported canonical `FindingEvidence` from `@leadguard/shared` |
| `apps/api/src/services/public/publicAuditService.ts` | **MODIFIED** | Delegated evidence sanitization to `sanitizeFindingEvidence` |
| `apps/api/src/services/public/guestScanService.ts` | **MODIFIED** | Delegated evidence sanitization to `sanitizeFindingEvidence` and aligned DTO shape |
| `apps/web/src/components/ui/FindingCard.tsx` | **MODIFIED** | Aligned props with `FindingEvidence`, added safe multi-shape rendering |
| `apps/web/src/features/scan/ScanResultView.tsx` | **MODIFIED** | Aligned DTO interface and evidence rendering with `normalizeFindingEvidence` |
| `apps/web/src/api/audits.ts` | **MODIFIED** | Aligned `FindingEvidence` with `@leadguard/shared` |
| `tests/pre-3b-remediation.test.ts` | **MODIFIED** | Added comprehensive real-behavior unit tests |
| `scratch/evidence_browser_qa.mjs` | **NEW** | Browser QA verification script |
| `docs/PHASE_3A8_F5_IMPLEMENTATION.md` | **NEW** | Technical implementation and verification record |
