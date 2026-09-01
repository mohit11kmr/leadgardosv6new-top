---
description: Report LeadGuard OS V6's actual current architecture (workspaces, data flow, boundaries) from source.
---

Produce a current-state architecture report for LeadGuard OS V6, verified from source (not from `docs/*`, which may be stale).

1. **INSPECT** — `package.json` workspaces list, each `apps/*`/`packages/*`'s own `package.json` and entrypoint, `packages/database/prisma/schema.prisma`, `packages/config/src/index.ts`, `docker-compose.yml`, `.github/workflows/ci.yml`.
2. **ANALYZE** — how do the pieces actually connect at runtime (API → Prisma → Postgres, API → BullMQ → Redis → worker, worker → external HTTP)? What are the enforced boundaries (see `tests/architecture.test.ts`)?
3. **REPORT** — a text-based architecture diagram plus a short description per workspace/package, matching the format in `docs/CLAUDE_ENGINEERING.md` (update that file if this reveals drift from what it currently documents).

Read-only. Do not modify files except `docs/CLAUDE_ENGINEERING.md` if explicitly asked to update it.
