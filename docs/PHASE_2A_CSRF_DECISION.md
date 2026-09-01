# CSRF Decision (Phase 2A, Section 4)

Status: **No auth redesign required.** Existing design is sufficient; no
concrete CSRF vulnerability found. Documented per the task's "decision
only" instruction — no code changed for this section.

## What was checked

Every place the API reads a cookie, and every place a state-changing route
determines authentication, traced directly in `apps/api/src/routes.ts` and
`apps/api/src/auth.ts`.

### Cookie usage is narrow and explicit

`parseCookies(request.headers.cookie)` is called in exactly three places,
all in `apps/api/src/routes.ts`:

| Route | Method | Purpose |
|---|---|---|
| `/auth/refresh` (line 538) | POST | rotate refresh token, issue new access token |
| `/auth/logout` (line 633) | POST | revoke current refresh token |
| `/auth/sessions` (line 700) | GET | list active sessions (read-only) |

The cookie itself (`leadguard_refresh_token`, `apps/api/src/auth.ts:50-64`)
is set with:

```
HttpOnly; Path=/api/v1/auth; SameSite=Lax; Secure (prod only)
```

### All other (state-changing) routes require a Bearer header, never a cookie

`requireAuth` (`apps/api/src/routes.ts:183-192`) reads the access token
exclusively from `Authorization: Bearer <token>` — there is no fallback to
reading it from a cookie anywhere in the codebase. `apiRouter.use(requireAuth)`
(`routes.ts:759`) gates every application data route (websites, audits,
reports, webhooks, billing, admin, agency, settings, etc.) behind this
header-only check.

## Why this is sufficient

1. **The refresh/logout cookie can't be forged cross-site.** Both routes
   that use it are POST. `SameSite=Lax` cookies are attached by the browser
   only to top-level cross-site *navigations* (plain GET, e.g. clicking a
   link) — never to cross-site `fetch`/`XHR`/form POSTs. A CSRF attempt
   against `/auth/refresh` or `/auth/logout` from an attacker-controlled
   page therefore arrives with no cookie at all, and both routes already
   treat "no cookie" as an unauthenticated request (`cookies[REFRESH_COOKIE_NAME]
   ?? null`, `routes.ts:541,636`). Worst realistic CSRF outcome even if this
   reasoning were somehow bypassed is a forced logout — session invalidation,
   not data corruption or disclosure.

2. **The session-list GET is read-only and CORS-gated.** `/auth/sessions`
   only returns data; it doesn't mutate state. Even though `SameSite=Lax`
   does allow the cookie on a plain cross-site GET, the response body is
   not readable by an attacker's page: CORS (`apps/api/src/server.ts:73-84`)
   is an explicit allow-list (`config.CORS_ORIGINS` + `config.APP_URL`), not
   a wildcard or origin-reflection policy, so the browser's Same-Origin
   Policy blocks a non-listed origin from reading the response even with
   `credentials: true` on the server.

3. **Every state-changing endpoint is immune to classic CSRF by
   construction.** Because `requireAuth` accepts the access token only via
   an `Authorization` header — never a cookie, never a query param — an
   attacker's cross-site page has no mechanism to attach it. Browsers do not
   auto-attach arbitrary custom headers to cross-site requests the way they
   auto-attach cookies; that's precisely the property that makes
   bearer-token auth (as opposed to cookie-only session auth) structurally
   CSRF-resistant. This holds regardless of `SameSite` settings, because no
   cookie is involved in authenticating these requests at all.

## Conclusion

`SameSite=Lax` + `HttpOnly` refresh cookie (narrowly scoped to
`Path=/api/v1/auth`, POST-only endpoints) + mandatory `Authorization: Bearer`
header for all actual application state-changing endpoints is a coherent,
sufficient CSRF defense as implemented. No concrete vulnerability was found.
Per the task's explicit instruction, no auth rewrite was performed in this
phase.
