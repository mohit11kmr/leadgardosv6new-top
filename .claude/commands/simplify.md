---
description: Simplify recently-changed LeadGuard OS V6 code for reuse/efficiency without changing behavior (see also the built-in /simplify skill).
---

Review recently-changed code in LeadGuard OS V6 for simplification opportunities, following this workflow.

1. **INSPECT** — the current diff or the area named in `$ARGUMENTS`.
2. **ANALYZE** — duplicated logic that already exists elsewhere in the codebase (check `packages/shared` before assuming something is new), unnecessary abstraction for a one-off case, dead code, opportunities to reuse an existing helper/pattern instead of a new one.
3. **PLAN** — list the specific simplifications, each independently reversible.
4. **IMPLEMENT** — apply them, preserving exact existing behavior (this is a refactor, not a feature change).
5. **TEST / VERIFY** — run the existing tests for the touched area; typecheck clean; no behavior change.
6. **REPORT** — what was simplified, why, and the test evidence that behavior is unchanged.

Do not simplify by removing functionality, error handling, or validation that exists for a real reason (e.g. the crawl/rate-limit bounds — see `.claude/skills/performance/SKILL.md`).
