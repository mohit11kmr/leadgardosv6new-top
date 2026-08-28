# LeadGuard OS V6 — Production Infrastructure Matrix
**Documented Architecture vs Configured Infrastructure**

This document establishes the exact boundary between what is built into the LeadGuard OS V6 repository and what must be provisioned in the production cloud environment.

---

## 1. Subsystem Architecture vs Cloud Infrastructure

| Subsystem | Provided by Repository (Code / Scripts) | Required Cloud Infrastructure Provisioning | Status |
|---|---|---|:---:|
| **Application Services** | Docker multi-stage containers for `apps/web`, `apps/api`, and `apps/worker` with non-root security and healthchecks. | Container orchestration platform (AWS ECS, GCP Cloud Run, Kubernetes, or Docker Swarm) with CPU/memory limits. | `READY (CODE) / MANUAL (INFRA)` |
| **PostgreSQL Database** | Prisma schema, composite indexing, tuple pagination, migration scripts, connection pooling configuration, and data retention service (`RetentionService`). | Managed PostgreSQL 16 instance (AWS RDS, GCP Cloud SQL, Supabase, or dedicated host) with automatic storage scaling and multi-AZ failover. | `READY (CODE) / MANUAL (INFRA)` |
| **Database Backups & PITR** | `pg_dump` backup and `pg_restore` verification scripts documented in `docs/BACKUP_RECOVERY.md`. | Continuous WAL archiving enabled in cloud database with S3 replication and 30-day point-in-time recovery retention. | `REQUIRES EXTERNAL INFRASTRUCTURE` |
| **Redis Cache & Queues** | BullMQ queue managers with concurrency limits, exponential backoff retries, sliding-window rate limiters, and distributed locks. | Redis 7+ instance (AWS ElastiCache, Upstash, or persistent Redis container) with AOF persistence enabled (`appendonly yes`). | `READY (CODE) / MANUAL (INFRA)` |
| **Edge Routing & TLS** | Helmet security headers, CORS origin whitelisting, rate limiting headers, and `/health` & `/ready` diagnostic probes. | Reverse proxy / Load balancer (Nginx, AWS ALB, Cloudflare) with valid SSL/TLS certificates and DDoS protection. | `REQUIRES EXTERNAL INFRASTRUCTURE` |
| **Report PDF Storage** | Standalone HTML generation, SSRF-validated logo prefetch, and `LocalStorageProvider` / `S3StorageProvider` abstraction. | AWS S3 or Cloudflare R2 bucket with IAM least-privilege read/write credentials and private ACLs. | `REQUIRES EXTERNAL INFRASTRUCTURE` |
| **Commercial Billing** | Integer paise transaction calculations, webhook HMAC verification, and subscription state machines. | Live Razorpay merchant account, active API keys, and registered webhook endpoint URL. | `REQUIRES EXTERNAL INFRASTRUCTURE` |
| **Email Delivery** | Local mock dispatcher and SMTP interface (`nodemailer` / standard transport). | Transactional email provider (SendGrid, Postmark, AWS SES) or production SMTP gateway with SPF/DKIM records. | `REQUIRES EXTERNAL INFRASTRUCTURE` |

---

## 2. Infrastructure Pre-Flight Verification Checklist

Before directing live DNS traffic to LeadGuard OS:

- [ ] **Managed PostgreSQL**: Verified connection string and verified `npx prisma db push --skip-generate` executes successfully against target instance.
- [ ] **WAL Archiving**: Verified PostgreSQL `archive_mode = on` and WAL streaming to cloud bucket is active.
- [ ] **Redis Persistence**: Verified Redis is running with `appendonly yes` and sufficient memory allocation (>512MB).
- [ ] **Secret Injection**: Injected production 32+ character secrets for `JWT_SECRET`, `COOKIE_SECRET`, and `REFRESH_TOKEN_SECRET`.
- [ ] **TLS Certificate**: Verified HTTPS termination on `app.leadguard.io` and `api.leadguard.io`.
- [ ] **Payment Gateways**: Configured live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`.
