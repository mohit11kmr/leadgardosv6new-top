---
description: Review the current diff against LeadGuard OS V6's conventions (see also the built-in /code-review skill for a more general-purpose reviewer).
---

Review the current uncommitted diff (`git diff` / `git status`) in LeadGuard OS V6 against this repo's actual conventions, following the `code-reviewer` agent's checklist and `CLAUDE.md`.

1. **INSPECT** — `git status --short` and `git diff` for everything changed.
2. **ANALYZE** — for each changed file, does it match the sibling-file pattern for that kind of change (routes/services/components/migrations)? Auth/org-scoping present where needed? SSRF guard present on any new URL fetch? Secrets handled correctly? Tests present and meaningful (not just status-code checks)? Any scope creep — changes unrelated to the stated goal of this diff?
3. **REPORT** — findings with file:line, concrete problem, concrete failure scenario, severity. An empty findings list is a valid result — do not invent issues to seem thorough.

Read-only. Do not fix anything found unless explicitly asked to in a follow-up.
