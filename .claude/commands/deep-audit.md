---
description: Full, evidence-based deep audit of LeadGuard OS V6 across all layers — the Phase 1 counterpart to Phase 0 bootstrap.
---

Perform a full deep audit of LeadGuard OS V6, following this workflow. This is a reporting task — do not modify application code.

1. **INSPECT** — read actual source across `apps/api`, `apps/web`, `apps/worker`, `packages/database`, `packages/shared`, `packages/config`. Do not read or trust `README.md`/`docs/*` as ground truth for what's implemented — verify every claim against source.
2. **ANALYZE** — for each layer, determine: what's real vs. stubbed/fake, what's dead code (defined but never invoked — check this specifically, it has been a real bug class in this codebase before), what security issues exist (SSRF/IDOR/secrets/auth — see `.claude/skills/security/SKILL.md`), what bugs exist (concrete failure scenario per finding, not vague concern).
3. **PLAN** — do not implement here; note what a fix would look like without writing it.
4. **REPORT** — structured: project summary, tech stack table, architecture diagram, full API endpoint list, DB schema table, security findings by severity, bugs with file:line, performance issues, missing/stubbed features. Mark anything unconfirmed as "Needs Verification" rather than guessing.

This can be large — consider using parallel research forks per layer (api/worker/web/database) if the session supports it, then synthesize.
