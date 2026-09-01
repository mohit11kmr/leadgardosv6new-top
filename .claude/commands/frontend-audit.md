---
description: Audit apps/web for backend-contract drift, fake data, and missing states.
---

Audit LeadGuard OS V6's frontend (`apps/web`), following `.claude/skills/frontend/SKILL.md` and the `.agents/skills/leadguard-*` product skills. Read-only.

1. **INSPECT** — every feature view under `apps/web/src/features/*`, its data hooks (`apps/web/src/hooks/*`), and the actual API endpoint/response shape it depends on (verify the backend endpoint still exists and returns what the frontend expects — contract drift is a real risk after backend changes).
2. **ANALYZE** — any hardcoded/fabricated numbers or copy not traced to a real API field (violates `leadguard-no-fake-data`); missing loading/empty/error states; any import that would break the `apps/web` browser-boundary rule (`@leadguard/database`, `node:*` built-ins via `@leadguard/shared`'s main barrel).
3. **PLAN** — note fixes without implementing, unless asked to also fix.
4. **REPORT** — findings with file:line, grouped by severity, plus a note on whether each screen was actually checked in a browser or only read.

If fixing is requested: verify the result in a real browser afterward (see `browser-testing` skill) before reporting done.
