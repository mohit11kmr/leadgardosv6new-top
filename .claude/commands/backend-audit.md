---
description: Audit apps/api and apps/worker for correctness, dead code, and convention drift.
---

Audit LeadGuard OS V6's backend (`apps/api`, `apps/worker`), following `.claude/skills/backend/SKILL.md` and `.claude/skills/queues/SKILL.md`. Read-only.

1. **INSPECT** — every route in `apps/api/src/routes.ts` (auth tier, validation, org-scoping); every BullMQ job defined in `apps/worker/src/worker.ts` and confirm each is actually invoked (not just defined — this codebase has shipped a fully-built, never-started job before, check specifically for this pattern); transaction boundaries around DB-write + external-side-effect pairs.
2. **ANALYZE** — dead code (exported but never called), routes registered after the global `requireAuth` that should be public (or vice versa), missing Zod validation on mutating routes, non-atomic writes that should be transactional, fire-and-forget calls with no error handling.
3. **PLAN** — note fixes without implementing, unless asked to also fix.
4. **REPORT** — findings with file:line and concrete failure scenario, grouped by severity.

If fixing is requested: one fix at a time, each with a test that fails before and passes after, actually run.
