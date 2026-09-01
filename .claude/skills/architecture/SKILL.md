---
name: architecture
description: Repo-wide structural rules for LeadGuard OS V6 — workspace boundaries, where new code belongs, what must never cross a package boundary. Use before adding a new file, package, or cross-workspace import.
---

# Architecture

## Purpose
Keep the monorepo's boundaries intact so `apps/web`'s bundle stays browser-safe and each workspace's responsibility stays singular.

## When to use
Before creating a new file, a new package, or any import that crosses `apps/*` or `packages/*` boundaries.

## Repository-specific rules
- Workspaces: `apps/api` (Express API), `apps/web` (React SPA), `apps/worker` (BullMQ jobs), `packages/database` (sole Prisma owner), `packages/shared` (browser-safe utilities/scanners), `packages/config` (Zod env schema).
- `apps/web` must never import `@leadguard/database`, `@prisma/client`, `express`, `bullmq`, `ioredis`, `argon2`, or anything from `apps/api`/`apps/worker`. Enforced by `tests/architecture.test.ts` — run it after any web-side dependency change.
- `packages/shared`'s main barrel (`src/index.ts`) must stay import-safe for the browser. Anything using `node:*` built-ins (crypto, fs, net) goes in `packages/shared/src/server-only/` and is imported via that subpath directly from `apps/api`/`apps/worker` only — see the existing `server-only/secret-encryption.ts` for the pattern.
- `apps/worker` must not import `apps/api/src/routes` or React/Express.
- New shared logic used by both api and worker (scanners, scoring, types) belongs in `packages/shared`, not duplicated in both apps.
- New env vars are added to `packages/config/src/index.ts`'s Zod schema, never read via raw `process.env` in application code.

## Workflow
1. Identify which workspace genuinely owns the new logic (ask: does the browser need this? does only the worker need this?).
2. Check `tests/architecture.test.ts` for the current forbidden-import list before adding a cross-boundary import.
3. If the logic must be shared but uses Node built-ins, put it under `packages/shared/src/server-only/` and import via the explicit subpath.

## Verification requirements
- `npx vitest run tests/architecture.test.ts` passes.
- `npm run build --workspace @leadguard/web` still produces a clean Vite build (catches accidental Node-built-in leaks into the browser bundle — this has broken before).

## Failure conditions
- A Vite build failure mentioning a Node built-in (`node:crypto`, `node:fs`) not being externalizable almost always means a server-only module leaked into `packages/shared`'s main barrel export.
