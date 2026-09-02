# LeadGuard OS V6 — Backup & Disaster Recovery Architecture

> **Status: FUTURE / TARGET ARCHITECTURE — not yet implemented.** Verified against source as of Phase 2 (2026-09-02): no WAL archiving, off-site storage, warm replica, or managed-failover infrastructure exists anywhere in this repository, and none of the `docker`/container names below are defined in `docker-compose.yml`. For what actually exists today, see `docs/DATABASE_BACKUP_RUNBOOK.md` and `docs/DATABASE_RESTORE_RUNBOOK.md`. This document remains useful as the target design once a managed Postgres provider is chosen — read it as a plan, not a runbook.

This document establishes the *target* operational procedures for database backups, Point-In-Time Recovery (PITR), data retention schedules, and disaster recovery execution for LeadGuard OS V6.

---

## 1. Database Backup Architecture

LeadGuard utilizes PostgreSQL as the primary relational data store. In production environments, data protection operates across three layers:

1. **Continuous WAL Archiving (Point-In-Time Recovery)**:
   - PostgreSQL Write-Ahead Logs (WAL) are streamed continuously to encrypted off-site cloud storage (e.g. AWS S3 / GCS).
   - Allows restoration to any arbitrary timestamp with sub-minute granularity.
2. **Automated Daily Physical Snapshots**:
   - Automated nightly base backups executed during low-traffic windows (02:00 UTC).
   - Retention policy: 30 daily snapshots, 12 monthly snapshots.
3. **Transactional Outbox Event Self-Healing**:
   - `OutboxEvent` tables maintain an immutable audit trail of domain state transitions. If external delivery services (such as webhooks) experience outages, events are replayable without restoring physical database snapshots.

---

## 2. Retention Schedules

| Data Entity | Retention Period | Purge Mechanism |
|---|:---:|---|
| **Primary Business Records** (Users, Orgs, Websites, Audits, Reports) | Indefinite (until user deletion) | Soft deletion with tenant isolation |
| **Raw API Telemetry** (`ApiUsage`) | 90 Days | `RetentionService.purgeOldApiUsage()` |
| **Webhook Delivery Logs** (`WebhookDelivery`) | 60 Days | `RetentionService.purgeOldWebhookDeliveries()` |
| **Processed Outbox Events** (`OutboxEvent`) | 30 Days | `RetentionService.purgeProcessedOutboxEvents()` |
| **Report Share Links (Expired)** | 30 Days post-expiry | Automatic revocation and purge |

---

## 3. Step-by-Step Restoration Procedure

### Step 3.1: Restoring from Automated Snapshot (`pg_dump / pg_restore`)

```bash
# 1. Terminate active application connections
docker stop leadguard-api leadguard-worker

# 2. Drop corrupted database and recreate
dropdb -h localhost -p 5432 -U postgres leadguard
createdb -h localhost -p 5432 -U postgres leadguard

# 3. Restore from compressed archive
pg_restore -h localhost -p 5432 -U postgres -d leadguard -v /backups/leadguard_backup_2026-08-28.dump

# 4. Verify Prisma schema migrations
npx prisma migrate status

# 5. Restart application services
docker start leadguard-api leadguard-worker
```

---

## 4. Disaster Recovery Matrix

| Scenario | Detection | Immediate Action | Recovery Time Objective (RTO) | Recovery Point Objective (RPO) |
|---|---|---|:---:|:---:|
| **Primary Postgres Failure** | Health check `/ready` returns 503 | Promote warm replica / trigger cloud managed failover | < 2 minutes | < 10 seconds |
| **Data Corruption / Bad Migration** | Error spikes in API telemetry | Roll back migration and restore WAL to pre-corruption timestamp | < 30 minutes | < 1 minute |
| **Redis Node Outage** | Queue stalled events, rate limit bypass | Redis restart / cluster failover (in-flight jobs retry automatically via BullMQ backoff) | < 1 minute | Zero business data loss |
| **Worker Host Failure** | Queue depth escalation in BullMQ | Stand up replacement worker container; jobs re-lock automatically | < 5 minutes | Zero data loss |
