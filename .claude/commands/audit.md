---
description: General-purpose audit of a given area of LeadGuard OS V6 — inspect and report, do not fix.
---

Audit the area of LeadGuard OS V6 named in `$ARGUMENTS` (or the whole repo if empty), following this workflow. Do not modify any files.

1. **INSPECT** — read the actual current code for the named area. Do not trust `README.md`/`docs/*` as ground truth; verify claims against source.
2. **ANALYZE** — identify what's real, what's stubbed/fake, what's missing, what's inconsistent with the rest of the codebase's conventions (see `CLAUDE.md` and `.claude/skills/*`).
3. **PLAN** — do not produce here; this command stops at reporting.
4. **REPORT** — structured findings: what exists (file:line), what's broken/missing (concrete failure scenario, not vague concern), severity, and what would need to change (without implementing it).

If the scope is unclear, ask which area (`backend`, `frontend`, `database`, `security`, `api`, `queues`) before starting rather than guessing.
