# LeadGuard OS V6 — Authentication & Session Lifecycle

---

## 1. Authentication Flow Overview

```
Client                             API Server                         PostgreSQL / Redis
  │                                    │                                      │
  │─── POST /api/v1/auth/login ───────>│                                      │
  │    (email, password)               │─── Verify Argon2id Password ────────>│
  │                                    │─── Create Session (SHA-256 Token) ──>│
  │<── Set-Cookie: HttpOnly Refresh ───│                                      │
  │    JSON: { accessToken (15m) }     │                                      │
  │                                    │                                      │
  │─── Authenticated Requests ────────>│                                      │
  │    Header: Bearer <accessToken>    │─── JWT Verification (Local Secret) ──│
  │                                    │                                      │
  │─── (On Access Token Expiry) ──────>│                                      │
  │─── POST /api/v1/auth/refresh ─────>│                                      │
  │    Cookie: leadguard_refresh_token │─── Lookup Session & Check Reuse ────>│
  │                                    │─── Rotate: New Token Hash ──────────>│
  │<── Set-Cookie: New HttpOnly ───────│                                      │
  │    JSON: { newAccessToken }        │                                      │
```

---

## 2. Token Specifications

| Token Type | Storage | Lifetime | Cryptographic Algorithm |
|---|---|---|---|
| **Access Token** | Memory / Client state | 15 minutes | JWT HS256 (`sub`, `organizationId`) |
| **Refresh Token** | HttpOnly Secure Cookie | 30 days | 48-byte cryptographically secure random (`base64url`), stored as SHA-256 hash |
| **Password Reset** | Database Token | 1 hour | 32-byte hex, stored as SHA-256 hash, single-use |
| **Email Verify** | Database Token | 24 hours | 32-byte hex, stored as SHA-256 hash, single-use |

---

## 3. Session Revocation & Multi-Device Security

- **Single Device Logout**: `POST /api/v1/auth/logout` sets `revokedAt = now()` on the active session and clears the HttpOnly cookie.
- **Revoke All Other Devices**: `POST /api/v1/auth/logout-all` terminates all active sessions for the user across all browsers.
- **Password Change Invalidation**: Confirming a password reset immediately revokes all active sessions for that user.
