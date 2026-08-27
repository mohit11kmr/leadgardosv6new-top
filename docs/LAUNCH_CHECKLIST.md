# LeadGuard OS V6 — Production Launch Checklist

Complete this checklist prior to flipping production DNS and onboarding commercial customers.

---

## 1. Infrastructure & Environment Verification

- [x] **PostgreSQL Database**: Connection pooling verified; migrations applied up-to-date (`npx prisma migrate deploy`).
- [x] **Redis Cluster**: Configured with persistent storage (`appendonly yes`) and sufficient memory for BullMQ queues and rate limiters.
- [x] **Environment Secrets**: Zero production credentials committed to version control; `.env.example` strictly sanitized.
- [x] **Zero Firebase**: Confirmed 0 production references to Firebase or Firestore across all workspaces.
- [x] **Liveness & Readiness Probes**: Verified `GET /health` returns 200 and `GET /ready` verifies DB and Redis connectivity.

---

## 2. Security & Compliance Gates

- [x] **SSRF Outbound Validator**: Verified blocking loopback (`127.0.0.1`), private IPv4/IPv6, and cloud metadata endpoints (`169.254.169.254`).
- [x] **Session Security**: Refresh tokens stored in HttpOnly, SameSite=Strict cookies with token rotation & reuse detection.
- [x] **Rate Limiting**: Sliding-window Redis rate limits enforced for audits, monitor runs, and reads per API key and organization.
- [x] **IDOR & Multi-Tenancy**: All domain services enforce `where: { id, organizationId }` returning 404 on cross-tenant attempts.
- [x] **Webhook Security**: HMAC-SHA256 signatures with 300s replay protection and manual redirect hop SSRF checks.

---

## 3. Commercial & Operational Readiness

- [x] **Razorpay Gateway**: Webhook HMAC verification active, integer paise pricing accuracy, and entitlement synchronization.
- [x] **Public Developer API**: OpenAPI 3.1 schema published, interactive Swagger UI available at `/public/docs`.
- [x] **Legal & Policy Pages**: Privacy Policy (`/privacy`), Terms of Service (`/terms`), Cookie Policy (`/cookies`), and Refund Policy (`/refund`) accessible.
- [x] **Automated Telemetry Lifecycle**: 90-day retention cleanup for raw `ApiUsage` logs and 60-day cleanup for webhook logs.

---

## 4. UI/UX Quality Verification

- [x] **Design Consistency**: Standardized dark slate palette, typography, badges, and cards across all 12 modules.
- [x] **State Handling**: Verified loading skeletons, empty states, error retry handlers, and form validations on every screen.
- [x] **Responsive Viewports**: Verified desktop, tablet, and mobile responsiveness with zero horizontal overflow.
