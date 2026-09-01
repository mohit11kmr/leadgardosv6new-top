---
name: security
description: Security rules and checklist for LeadGuard OS V6 — SSRF, IDOR, secrets, auth. Use before touching auth, URL-fetching code, webhook handling, or anything that stores a secret.
---

# Security

## Purpose
This product's core feature is scanning arbitrary user-supplied websites, so SSRF is the single highest-value class of bug here — treat it accordingly. Also covers the codebase's other load-bearing security mechanisms.

## When to use
Before changing auth/session code, anything that fetches a user-supplied URL, webhook handling, or anything that persists a secret.

## Repository-specific rules
- **SSRF**: every fetch of a user-supplied URL — audit crawling, webhook delivery, PDF logo fetch, WhatsApp link building, guest scans — must call `validateExternalUrl()` (`packages/shared/src/url-security.ts`) first. It blocks localhost/private/link-local ranges and does a DNS-lookup check; it's re-checked on every redirect hop in the webhook worker (do the same for any new redirect-following code). Known residual gap: it validates at request time, and the private-IP regex doesn't match IPv4-mapped-IPv6 form (`::ffff:169.254.169.254`) — be aware of both when writing new fetch paths.
- **IDOR**: every authenticated query filters by `organizationId` from the verified JWT, never a client-supplied value. This is already consistent across ~100+ routes — don't be the exception.
- **Secrets at rest**: password/token/API-key values are one-way hashed (`tokenHash`, `keyHash`). Values that must be recoverable later (webhook HMAC signing secrets) are AES-256-GCM encrypted via `packages/shared/src/server-only/secret-encryption.ts`, never stored plaintext despite what a column name might suggest.
- **Auth**: JWT access token (15 min) + rotating hashed refresh token with reuse detection (a replayed old refresh token revokes all sessions for that user) + Argon2id password hashing. Don't invent a parallel auth mechanism.
- **RBAC**: capability matrix in `apps/api/src/middleware/rbac.ts`; platform-admin routes use `requirePlatformAdmin()`, separate from org-role permissions.
- **Rate limiting**: Redis-backed, keyed by `TRUST_PROXY`-aware client IP (`packages/shared/src/request-utils.ts`) — defaults to socket address unless `TRUST_PROXY=true`, preventing `X-Forwarded-For` spoofing by default.
- **Input validation**: every mutating route uses a Zod schema; don't destructure `request.body` raw.
- **CORS**: explicit origin allowlist from `config.CORS_ORIGINS`/`APP_URL`, credentials enabled — don't widen to `*` with credentials.

## Workflow
1. Before writing code that fetches a URL: confirm `validateExternalUrl` is in the call path, including after any redirect.
2. Before adding a new persisted secret: decide up front whether it needs to be recoverable (encrypt) or only verifiable (hash) — don't default to plaintext "for now."
3. Before adding a new authenticated route: confirm it's org-scoped and behind the right `requirePermission`/`requirePlatformAdmin`.

## Verification requirements
- A test proving the new endpoint enforces tenant isolation (org A cannot see org B's data — the established pattern across `tests/security/*idor*.test.ts`).
- For anything URL-fetching: a test that a private/loopback/metadata-address target is rejected.
- `npm audit --omit=dev` reviewed for new high/critical findings introduced by a dependency change (don't silently `npm audit fix` without reviewing what it changes).

## Failure conditions
- A 200 response containing another organization's data on an authenticated route is a critical IDOR — stop and fix before anything else.
- A new outbound fetch that doesn't go through `validateExternalUrl` is a critical SSRF gap in this specific product (it scans arbitrary user-submitted URLs by design).
