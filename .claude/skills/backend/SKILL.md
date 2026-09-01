---
name: backend
description: Conventions for apps/api (Express routes/services) and apps/worker (BullMQ jobs) in LeadGuard OS V6. Use when adding or changing an API route, service method, or background job.
---

# Backend (apps/api + apps/worker)

## Purpose
Keep new backend code consistent with this repo's established auth, validation, and job patterns instead of inventing new ones per change.

## When to use
Adding/changing an Express route, a service method, or a BullMQ job/worker.

## Repository-specific rules
- Every mutating route validates its body with a Zod schema and calls `.parse()` — see the schemas defined near the top of `apps/api/src/routes.ts` for the house style. Never destructure `request.body` directly in a handler.
- Every authenticated route filters DB queries by `request.auth!.organizationId`, never a client-supplied org/user ID.
- Platform-admin-only routes use `requirePlatformAdmin()`; org-scoped permission routes use `requirePermission('CAPABILITY')` (see `apps/api/src/middleware/rbac.ts` for the capability matrix).
- Public/unauthenticated routes are registered **before** the global `apiRouter.use(requireAuth)` call in `routes.ts` — placing a public route after it silently makes it require auth (a real bug hit during this project's own development).
- Any outbound fetch to a user-supplied URL goes through `validateExternalUrl` from `@leadguard/shared`.
- Worker jobs that must survive a mid-process crash write their state-changing DB update and any outbox-event row in the **same** `db.$transaction` — see `apps/worker/src/audit/vaultScan.ts` for the pattern (and the bug it fixed: a crash between two separate writes silently dropped a webhook forever).
- Config values come from `import { config } from '@leadguard/config'`, never `process.env` directly in new code.
- Fire-and-forget side effects (webhook dispatch, notification emails) use `.catch((err) => console.error(JSON.stringify({...})))`, never an unhandled promise.

## Workflow
1. Find the nearest existing route/service/job that does something similar; match its shape.
2. Add the Zod schema, the permission middleware, and the org-scoping before writing business logic.
3. If it's a worker job with a DB write + external side effect (webhook, email), decide up front whether they need to be atomic — if yes, use `db.$transaction`.

## Verification requirements
- `npm run typecheck --workspace @leadguard/api` / `--workspace @leadguard/worker` clean.
- A vitest integration test exercising the new route/job end to end (see `tests/` for the house pattern: `supertest` against `apps/api/src/server.js`, real Postgres/Redis via `docker compose up -d`).
- For a new public route, an explicit test that it works **without** an Authorization header, and (if it shouldn't be public) that authenticated routes still require one.

## Failure conditions
- A route returning 401 when it should be public almost always means it was registered after `apiRouter.use(requireAuth)`.
- A "successful" run that silently drops a side effect (webhook, email) on process restart usually means a state update and its side-effect trigger weren't in the same transaction.
