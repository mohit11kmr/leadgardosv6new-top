# LeadGuard OS V6 — Production Launch Runbook

This runbook provides step-by-step operational instructions for standing up, configuring, verifying, and recovering the LeadGuard OS V6 production deployment.

---

## 1. DNS Configuration
- Create `A` / `CNAME` records pointing to your edge load balancer or reverse proxy:
  - `leadguard.io` (Root domain)
  - `app.leadguard.io` (Web SPA frontend)
  - `api.leadguard.io` (REST API backend)

## 2. TLS & SSL Certificates
- Provision TLS 1.3 certificates via Let's Encrypt (Certbot) or AWS ACM / Cloudflare SSL.
- Ensure strict HSTS is enabled (`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`).

## 3. Reverse Proxy & Edge Routing
- Deploy Nginx or AWS Application Load Balancer (ALB).
- Direct `/api/` traffic to `api:4000`.
- Direct web assets and index routing to `web:80` (or static CDN distribution).
- Ensure client IP forwarding headers are set: `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`.

## 4. Database Provisioning (PostgreSQL 16)
- Provision managed PostgreSQL 16 instance (e.g. AWS RDS or Supabase).
- Execute initial migration validation:
  ```bash
  DATABASE_URL="postgresql://user:pass@host:5432/leadguard" npx prisma db push --skip-generate
  ```
- Verify connection pooling limit matches container capacity (`connection_limit=20`).

## 5. Redis Provisioning (Redis 7+)
- Provision Redis instance with AOF persistence enabled (`appendonly yes`).
- Verify low-latency connection (<5ms) from API and Worker services.

## 6. Worker Fleet Deployment
- Deploy `apps/worker` as a long-running background daemon.
- Configure resource bounds: minimum 1 vCPU, 1 GB RAM per worker instance.
- Ensure worker has outbound internet connectivity for diagnostic audits and webhook deliveries.

## 7. Object Storage (AWS S3 / Cloudflare R2)
- Create private bucket: `leadguard-reports-prod`.
- Configure bucket lifecycle rule to transition old reports (>180 days) to cold storage.
- Provision IAM policy with `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions.

## 8. Commercial Billing (Razorpay Integration)
- Obtain production `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from Razorpay Dashboard.
- Set webhook URL in Razorpay Dashboard: `https://api.leadguard.io/api/v1/billing/webhooks`.
- Register the shared webhook secret as `RAZORPAY_WEBHOOK_SECRET`.

## 9. AI Provider Setup
- For rule-based deterministic pitches with zero external dependencies, leave `AI_PROVIDER=MOCK`.
- If enabling live LLM generation, set `AI_PROVIDER=LIVE` and configure `AI_API_KEY`.

## 10. Email Gateway Setup
- Configure production SMTP gateway (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) or integrate transactional email provider.
- Verify SPF (`v=spf1 ...`) and DKIM DNS TXT records for `leadguard.io`.

## 11. Automated Backup Verification
- Verify cloud WAL archiving is active on the PostgreSQL instance.
- Test backup restoration into a staging/disposable database using `pg_restore`.

## 12. Monitoring & Observability
- Configure container health check probes targeting:
  - `GET http://api:4000/health` (Liveness)
  - `GET http://api:4000/ready` (Readiness: verifies database and Redis connectivity)
- Aggregate structured JSON logs to your logging backend (Datadog, Grafana Loki, CloudWatch).

## 13. Alerting & On-Call Setup
- Configure PagerDuty / Opsgenie / Slack webhook integrations for worker dead-letter queues and unhandled API 500 spikes.

## 14. Zero-Downtime Rollback Procedure
- If a regression is detected post-deployment:
  1. Revert container image tag to previous stable git commit SHA (e.g. `b54c2b9`).
  2. Perform zero-downtime rolling restart of `web`, `api`, and `worker` containers.
  3. If database schema rollback is required, apply the backward-compatible down-migration script.

## 15. Incident Response Playbook
- **Database Unavailable**: API returns `503 Service Unavailable` via `/ready` probe; traffic shifted away by load balancer until DB recovers.
- **Redis Queue Failure**: Worker automatically retries stalled jobs with exponential backoff; outbox events self-heal via transaction logs.
- **Webhook Target Unresponsive**: Exponential backoff up to 5 attempts; non-retryable 4xx codes marked as permanent failures with diagnostic error logging.
