---
name: database
description: Prisma/PostgreSQL rules for LeadGuard OS V6 — migration workflow, safety, and read-only-by-default policy for production data. Use before any schema change or raw query.
---

# Database (packages/database)

## Purpose
Prevent destructive or unreviewed schema/data changes, and keep migrations reproducible.

## When to use
Any change to `packages/database/prisma/schema.prisma`, a new migration, or a raw SQL query anywhere in the codebase.

## Repository-specific rules
- **Production database = READ ONLY unless explicitly authorized by the user in this conversation.** Never run a migration, seed, or destructive command against anything but the local dev/test Postgres (`docker-compose.yml`, ports 15432/6379→16380 for redis).
- Schema changes require: `DATABASE_URL="postgresql://leadguard:leadguard@localhost:15432/leadguard" npx prisma migrate dev --schema packages/database/prisma/schema.prisma --name <descriptive_name>`, then `npm run build --workspace @leadguard/database`, then typecheck every workspace that consumes it.
- History note: this repo's migration history was squashed once already (`d966f05` "C1/C2 rebaseline"); only one baseline migration existed for a while before this project's work added several incremental ones. Don't squash again without explicit instruction.
- Only two `$queryRaw`/`$executeRaw` call sites exist repo-wide (a health-check `SELECT 1` and an advisory-lock call), both using Prisma's tagged-template auto-parameterization. Any new raw SQL must use the same tagged-template form — never string-concatenate a query.
- Secrets/tokens are stored as hashes (`tokenHash`, `keyHash`) or, where the raw value must be recoverable (e.g. webhook HMAC signing), as AES-256-GCM ciphertext via `packages/shared/src/server-only/secret-encryption.ts` — never as plaintext.
- Every org-owned model needs an `organizationId` column and should be queried filtered by it — this is the codebase's primary tenant-isolation mechanism.

## Workflow
1. Add the model/field change to `schema.prisma`.
2. Generate the migration against the local dev DB only (see command above).
3. Rebuild `@leadguard/database` and re-typecheck every dependent workspace — a stale `dist/` there causes confusing type errors in api/worker that look unrelated.
4. Write or extend a test that exercises the new column/model.

## Verification requirements
- Migration applies cleanly against a fresh local DB (`docker compose up -d` then the migrate command above with no manual schema edits after).
- `npm run typecheck --workspaces` clean.
- A test proves the new field/model behaves as intended (not just "migration ran").

## Failure conditions
- `npm run typecheck` failing with "property X does not exist" right after a schema change almost always means `@leadguard/database` wasn't rebuilt (`npm run build --workspace @leadguard/database`) — not a real type error.
- If a migration would touch a table used in production (i.e. this is anything beyond local dev), stop and ask before running it.
