---
description: Security-focused audit of LeadGuard OS V6 — SSRF, IDOR, secrets, auth/RBAC, input validation, dependencies.
---

Perform a security audit of LeadGuard OS V6 (or the area named in `$ARGUMENTS`), following `.claude/skills/security/SKILL.md`'s priority order. Read-only — report findings, do not fix unless explicitly asked afterward.

1. **INSPECT** — every outbound fetch of a user-supplied URL (audit crawler, webhook delivery, PDF logo, WhatsApp links, guest scans) and confirm `validateExternalUrl` guards it, including redirect hops. Every authenticated route for `organizationId` scoping. Every persisted secret for hash-vs-encrypt-vs-plaintext. Auth/RBAC middleware placement (registered before/after the global `requireAuth` in `routes.ts`). `npm audit --omit=dev` for dependency vulnerabilities.
2. **ANALYZE** — for each finding, a concrete failure scenario (exact input/state → exact bad outcome), not a hypothetical concern. Severity per finding (Critical/High/Medium/Low).
3. **PLAN** — note the fix approach without implementing it, unless the user asked this command to also fix.
4. **REPORT** — findings ranked by severity, file:line, failure scenario, suggested fix direction. If fixing was requested: implement with a test proving the vulnerability is closed, run it, report actual results.

Never fabricate a finding to appear thorough — an empty list is a valid result. Never exploit anything against a live third-party target.
