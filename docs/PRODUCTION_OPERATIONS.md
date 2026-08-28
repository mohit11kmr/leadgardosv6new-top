# LeadGuard OS V6 — Production Operations & Infrastructure Matrix

This document defines the clear division of responsibility between what the LeadGuard OS code repository provides and what the production cloud infrastructure must provision.

---

## 1. Codebase Capabilities vs Infrastructure Requirements

| Component | Provided by Repository | Required Cloud Infrastructure Provisioning |
|---|---|---|
| **PostgreSQL Database** | Prisma schema, transactional DDL migrations, composite indexing, connection pooling configuration, soft-deletion queries, and data retention cleanup service. | Managed PostgreSQL 16 instance (e.g. AWS RDS, GCP Cloud SQL, Supabase Postgres, or dedicated VPS), WAL archiving configuration for Continuous Point-In-Time Recovery (PITR), and automated daily physical snapshot backup jobs. |
| **Redis & Queues** | BullMQ queue definitions, worker concurrency throttles, exponential backoff retries, sliding-window rate limiters, and distributed locks. | Redis 7+ instance with persistent AOF/RDB enabled (`appendonly yes`) and memory allocation sized for job concurrency. |
| **Reverse Proxy & TLS** | Helmet security headers, CORS origin whitelisting, rate limit headers, and liveness/readiness probes (`/health`, `/ready`). | Nginx, Cloudflare, or AWS ALB handling public TLS termination (HTTPS certificates), domain DNS routing (`app.leadguard.io`, `api.leadguard.io`), and DDoS edge mitigation. |
| **Report PDF Storage** | Standalone HTML report rendering, SSRF-validated image prefetching, and `LocalStorageProvider` / `S3StorageProvider` interfaces. | S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) with private ACLs and IAM access policies when running multi-instance workers. |
| **Secret Management** | Automated log redaction (`redactSensitive`), scrypt/argon2 hashing, and sanitized `.env.example`. | Cloud secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, or secure Kubernetes Secrets) injecting `DATABASE_URL`, `JWT_SECRET`, and `RAZORPAY_*` environment variables at container runtime. |

---

## 2. Real Backup Verification Procedure

```bash
# 1. Manual backup verification test
pg_dump -h localhost -p 15432 -U leadguard -d leadguard -F c -b -v -f /tmp/leadguard_test_backup.dump

# 2. Verify archive integrity
pg_restore --list /tmp/leadguard_test_backup.dump > /dev/null
echo "Backup archive verified successfully."

# 3. Clean up test artifact
rm /tmp/leadguard_test_backup.dump
```
