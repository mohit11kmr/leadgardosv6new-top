---
name: api
description: Public/internal REST API conventions for LeadGuard OS V6 — response envelope, versioning, pagination, error codes. Use when adding or changing any /api/v1 endpoint.
---

# API

## Purpose
Keep every endpoint's contract consistent so the web client, the public API-key consumers, and the OpenAPI doc (`apps/api/src/openapi.ts`) don't drift from what the code actually does.

## When to use
Adding, changing, or documenting any route under `/api/v1`.

## Repository-specific rules
- Response envelope: `{ success: true, data: ... }` or `{ success: false, error: { code, message, requestId? } }` — every handler follows this, including error paths (see the `next(error)` → centralized handler flow in `apps/api/src/server.ts`, which maps Zod/Prisma errors to this shape automatically).
- All routes are mounted under `/api/v1` via `apiRouter`.
- Auth tiers, in order of where they're registered in `routes.ts`: fully public (before `apiRouter.use(requireAuth)`), authenticated session (JWT), authenticated API key (`apiKeyService`, separate from session auth, used by the `/public/*` developer-facing endpoints), platform-admin (`requirePlatformAdmin()`).
- Pagination: cursor-based (`cursor`/`limit` query params, `nextCursor`/`hasMore` in the response) is the house pattern for list endpoints — see `adminService.listUsers` for the canonical shape. Don't introduce offset-based pagination for a new list endpoint.
- `apps/api/src/openapi.ts` documents the public developer-facing API surface — update it when adding/changing a route under `/public/*` that external API-key consumers use.
- Rate limits are defined per-route-class in `packages/config` (`AUTH_RATE_LIMIT`, `AUDIT_RATE_LIMIT`, `API_RATE_LIMIT`, `WEBHOOK_RATE_LIMIT`) and enforced via Redis-backed middleware in `apps/api/src/middleware/rateLimiters.js`.

## Workflow
1. Decide the auth tier first — it determines where in `routes.ts` the route is registered (see the `backend` and `security` skills).
2. Define the Zod body/query schema before the handler body.
3. Follow the existing error-code conventions for that resource (grep sibling routes for the `code:` strings already in use, e.g. `NOT_FOUND`, `PLAN_LIMIT_REACHED`, `INVALID_REQUEST`) rather than inventing new ones.
4. Update `apps/api/src/openapi.ts` if the route is public/developer-facing.

## Verification requirements
- A `supertest` test asserting the exact response envelope shape (`success`, `data`/`error.code`) for both the happy path and at least one error path.
- If paginated: a test with more items than one page, asserting `hasMore`/`nextCursor` behave correctly.

## Failure conditions
- A response that doesn't match the `{success, data}`/`{success, error}` envelope will break every existing client parsing convention — don't hand-roll a different shape "just this once."
