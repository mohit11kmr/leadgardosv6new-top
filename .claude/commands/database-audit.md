---
description: Audit packages/database's Prisma schema and migration history for consistency and risk.
---

Audit LeadGuard OS V6's database layer (`packages/database`), following `.claude/skills/database/SKILL.md`. Read-only — never run a migration or write against anything but a local dev DB, and only with explicit authorization.

1. **INSPECT** — `packages/database/prisma/schema.prisma` (every model, relation, index, unique constraint), `packages/database/prisma/migrations/*` (order and content of recent ones), every `$queryRaw`/`$executeRaw` call site repo-wide.
2. **ANALYZE** — models missing `organizationId` where tenant isolation would be expected; secrets stored as plaintext instead of hashed/encrypted; raw SQL that isn't using Prisma's auto-parameterized tagged templates; missing indexes on frequently-filtered columns; orphaned/stray migration directories.
3. **PLAN** — note the migration/fix that would be needed without generating it, unless asked to also implement.
4. **REPORT** — findings with file:line (schema.prisma line numbers), grouped by severity.

If a fix/migration is requested: generate and apply it only against the local dev Postgres (`docker compose up -d` first), rebuild `@leadguard/database`, re-typecheck all workspaces, and report the result.
