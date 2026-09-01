---
description: Audit the /api/v1 surface for contract consistency (envelope, auth tiers, pagination, error codes).
---

Audit LeadGuard OS V6's API surface (`apps/api/src/routes.ts` + `apps/api/src/openapi.ts`), following `.claude/skills/api/SKILL.md`. Read-only.

1. **INSPECT** — every route: method, path, auth tier, validation schema, response shape. Cross-check against `apps/api/src/openapi.ts` for public/developer-facing routes.
2. **ANALYZE** — routes not following the `{success, data}`/`{success, error}` envelope; routes registered in the wrong place relative to the global `requireAuth` (public route accidentally requiring auth, or vice versa); missing Zod validation; list endpoints not using the established cursor-pagination shape; `openapi.ts` drift from actual route behavior.
3. **PLAN** — note fixes without implementing, unless asked to also fix.
4. **REPORT** — a full endpoint table (method, path, auth, description) plus findings with file:line, grouped by severity.
