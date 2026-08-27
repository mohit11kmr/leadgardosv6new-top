# LeadGuard OS V6 — Security Architecture & Guidelines

LeadGuard OS V6 is designed from the ground up as a zero-trust, self-hosted B2B SaaS platform with strict enterprise security boundaries.

---

## Core Security Tenets

1. **Zero External Auth Vendor Dependency (No Firebase)**:
   - All authentication, cryptographic token generation, and authorization mechanisms are self-hosted via Argon2id, SHA-256 token hashing, and PostgreSQL persistence.
2. **HttpOnly Cookie Refresh Tokens**:
   - Refresh tokens are never exposed to client-side JavaScript or localStorage. They are stored strictly in `HttpOnly; SameSite=Lax; Path=/api/v1/auth` cookies.
3. **Refresh Token Rotation & Reuse Detection**:
   - Every refresh request generates a single-use replacement token.
   - If an already-rotated token is replayed, the entire session family for that user is immediately revoked, and a `REFRESH_REUSE_DETECTED` security event is recorded.
4. **Strict Tenant & IDOR Protection**:
   - Every database query for websites, audits, findings, pages, runs, and API keys is strictly filtered by `organizationId`.
   - Cross-tenant requests return `404 NOT_FOUND` to prevent resource enumeration.
5. **SSRF & Crawler Defense**:
   - Crawler fetches strictly enforce private IPv4/IPv6 address blocking (RFC 1918, RFC 4193, loopback, link-local) and cloud metadata endpoint blocking (`169.254.169.254`, `metadata.google.internal`).
6. **Tiered API Rate Limiting**:
   - Configurable rate limits protect authentication, password reset, email verification, audit execution, and public API endpoints against brute force and DDoS attacks.
7. **Sensitive Log Redaction**:
   - All structured logging and error outputs pass through automated redaction filtering passwords, tokens, API keys, and cookie headers.
