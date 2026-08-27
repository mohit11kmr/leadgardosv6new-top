# LeadGuard OS V6 — Database Migration Safety & Execution Guide

This document defines the strict procedures for authoring, testing, and applying Prisma schema migrations in production environments without downtime.

---

## 1. Migration Safety Principles

1. **Forward and Backward Compatibility**:
   - Application code in `main` must function against both `migration_N` and `migration_N+1`.
   - Never perform destructive operations (e.g. `DROP COLUMN`, `RENAME COLUMN`) in a single step.
2. **Three-Phase Schema Evolution**:
   - **Phase 1 (Expand)**: Add new optional column or table; update code to write to both old and new.
   - **Phase 2 (Backfill)**: Backfill data from old column to new column via background task.
   - **Phase 3 (Contract)**: Remove old column in a subsequent release once all active workers use the new structure.
3. **Transactional DDL**:
   - PostgreSQL executes schema migrations inside transactions by default. If any statement fails, the entire migration rolls back cleanly.

---

## 2. Production Deployment Procedure

In production CI/CD pipelines, migrations must be applied prior to updating application containers:

```bash
# 1. Inspect pending migration plan
npx prisma migrate status

# 2. Apply pending migrations safely
npx prisma migrate deploy

# 3. Validate database readiness probe
curl -f http://localhost:4000/ready
```

---

## 3. Index & Concurrency Guidelines

- All foreign keys and tenant isolation columns (`organizationId`, `userId`, `websiteId`) must be indexed.
- Composite cursor pagination queries rely on `(organizationId, createdAt, id)` composite indexes for high-throughput execution.
- Avoid locking high-volume tables with table-wide exclusive locks during peak traffic.
