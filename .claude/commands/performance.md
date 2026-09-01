---
description: Investigate a performance concern in LeadGuard OS V6 with actual measurement, not guesswork.
---

Investigate the performance concern named in `$ARGUMENTS` (or do a general pass if empty), following `.claude/skills/performance/SKILL.md`.

1. **INSPECT** — find the actual code path involved (DB query, crawl/audit pipeline, API route, frontend bundle).
2. **ANALYZE** — get a real measurement first (query timing, response time, bundle size) — don't optimize from a guess. Check whether the "slow" behavior is an intentional bound (crawl limits, rate limits, headless-render cost) before treating it as a bug.
3. **PLAN** — the specific change and its expected effect.
4. **IMPLEMENT** — apply it, preserving existing safety bounds unless the user explicitly authorized changing them.
5. **TEST / VERIFY** — a before/after measurement, and existing tests still pass.
6. **REPORT** — the measured before/after, what changed, and any bound that was touched (flagged explicitly, since bounds here often exist for cost/abuse-prevention reasons, not just speed).
