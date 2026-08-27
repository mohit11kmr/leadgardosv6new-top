# LeadGuard OS V6 — Enterprise Threat Model

---

## 1. System Assets

- **User Accounts & Credentials**: Password hashes (Argon2id), active session hashes, reset tokens.
- **Organization & Tenant Data**: Website configurations, domain ownership records, team memberships.
- **Diagnostic & Audit Dossiers**: Proprietary crawler findings, vulnerability scores, technical issue locations.
- **Revenue Intelligence Models**: Client traffic numbers, average deal values, potential opportunity loss figures.
- **API Keys & Integrations**: Hashed API secrets, webhook signing keys.
- **Scanning Engine Infrastructure**: Worker crawler nodes, HTTP fetch pools, Redis BullMQ queues.

---

## 2. Threat Analysis & Mitigations

| Threat | Risk Level | Attack Vector | Engineering Mitigation | Verification Test |
|---|---|---|---|---|
| **IDOR / Tenant Leakage** | CRITICAL | Malicious tenant queries or mutates another organization's website or audit. | All Prisma queries strictly scoped by `organizationId`. Returns `404 NOT_FOUND` for non-owned entities. | `tests/security/idor.test.ts` |
| **SSRF / Internal Scan Abuse** | CRITICAL | Attacker inputs `http://169.254.169.254` or `http://127.0.0.1` to probe internal infrastructure. | Per-hop IP resolution check blocks RFC 1918, RFC 4193, loopback, link-local, and cloud metadata hostnames. | `apps/api/src/security.test.ts`, `tests/fetcher.test.ts` |
| **Refresh Token Theft & Replay** | HIGH | Attacker intercepts or replays a refresh token. | Refresh token rotation (single use) + HttpOnly cookies + automatic reuse detection terminating session family. | `tests/security/auth.test.ts` |
| **Account Takeover via Brute Force** | HIGH | Credential stuffing against `/auth/login`. | Tiered rate limiting (15 req/min on auth), Argon2id hashing, generic login error responses. | `tests/security/auth.test.ts` |
| **Password Reset Token Reuse** | HIGH | Replaying intercepted password reset links. | SHA-256 hashed single-use tokens with 1-hour expiry; terminates all user sessions upon reset. | `tests/security/password-reset.test.ts` |
| **Crawler DoS / Resource Exhaustion** | MEDIUM | User triggers infinite depth crawl against massive websites. | Bounded concurrency (pool=4), max page bounds (default 25), 2MB size cap, global audit timeout. | `tests/crawler.test.ts`, `tests/perf.test.ts` |
| **Webhook Spoofing & Replay** | MEDIUM | Attacker injects fake webhook payloads to external systems. | HMAC-SHA256 signature calculation with timestamp tolerance (300s window). | `tests/security/webhook.test.ts` |
| **Sensitive Data Exposure in Logs** | MEDIUM | Credentials or tokens printed to log streams. | Structured log redaction filtering sensitive fields (`password`, `token`, `cookie`, `apiKey`). | `tests/security/redaction.test.ts` |
