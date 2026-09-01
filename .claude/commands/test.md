---
description: Run LeadGuard OS V6's Vitest suite (or a named subset) with correct local setup, and report actual results.
---

Run tests for LeadGuard OS V6, following `.claude/skills/testing/SKILL.md`.

1. **INSPECT** — is `docker compose up -d` needed (Postgres `:15432`, Redis `:16380` not already up)? Start it if not.
2. Run the suite: `npx vitest run` (full) or `npx vitest run <path>` if `$ARGUMENTS` names a specific file/area.
3. **VERIFY** — report the actual pass/fail/skip counts from the real output. For any failure, re-run that file in isolation before concluding it's a real regression (full-suite-only timeouts at 5000ms are known environmental flakiness here — see the testing skill).
4. **REPORT** — pass/fail counts, list of actual failures with their real error output, and for each: "real regression" or "flaky — passed in isolation" with evidence.

Never report "tests pass" without having actually run them this turn.
