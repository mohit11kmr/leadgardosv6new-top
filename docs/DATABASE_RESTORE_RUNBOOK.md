# Database Restore Runbook

**Status: CURRENT — manual procedure, not yet automated, not yet rehearsed.** This is deliberately a documented procedure, not a one-command script: a restore is destructive to whatever is currently in the target database, and this repository has no tooling that should ever run that unattended. See `docs/DATABASE_BACKUP_RUNBOOK.md` for how the archive you're restoring was produced.

## Before you do anything

1. **Confirm which database you are pointed at.** Print only the redacted target, never the full connection string:
   ```bash
   echo "$DATABASE_URL" | sed -E 's#//[^@]*@#//***:***@#'
   ```
2. **Back up the current (possibly-corrupt) state first**, even if it's suspected to be bad — a bad restore attempt should never destroy the only remaining copy of the pre-incident state:
   ```bash
   ./scripts/db-backup.sh
   ```
3. **If this is a production target**, this procedure requires a second person's confirmation before step 4 below. This repository has no automated approval gate for this — that is a process control, not a code control, until Phase 2's internal-RBAC/ops-console work (see the companion blueprints) gives it one.

## Restore procedure

```bash
# 1. Stop application processes that hold connections to this database.
#    (There is no Docker/production process-manager wiring for this yet —
#    stop whatever api/worker processes are actually running against this
#    DATABASE_URL in your environment.)

# 2. Confirm the target database name matches what you intend to restore into.
psql "$DATABASE_URL" -c '\conninfo'

# 3. Restore into the (assumed empty, or explicitly intended to be overwritten)
#    target database from a specific dump produced by scripts/db-backup.sh:
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" \
  ./backups/leadguard_<TIMESTAMP>.dump

# 4. Verify the Prisma migration state matches what the application expects:
npx prisma migrate status --schema packages/database/prisma/schema.prisma

# 5. Restart application processes and confirm health:
curl -sf "$API_URL/health" && curl -sf "$API_URL/ready"
```

`--clean --if-exists` drops and recreates existing objects inside the dump's scope before restoring — this is intentionally destructive to whatever is currently in the target database. Never run this against a database you have not just backed up in step 2 above.

## What this runbook does not (yet) cover

- **Point-in-time recovery** — `scripts/db-backup.sh` produces a snapshot at the moment it runs, not a continuous WAL stream. Restoring to an arbitrary point in time between two manual backups is not possible with the tooling that exists in this repository today. `docs/BACKUP_RECOVERY.md` describes PITR as a target-state capability; it is not available yet.
- **Automated/scheduled restores** — deliberately not built (see `docs/DATABASE_BACKUP_RUNBOOK.md`'s "Do not run destructive restore operations" constraint carried over from the Phase 2 operating rules).
- **A rehearsed timing** — this procedure has not been executed end-to-end against a copy of this codebase's actual schema and data volume. Until it has, treat the RTO in `docs/DATABASE_BACKUP_RUNBOOK.md` as unverified, not just "undefined."

## Recommended next step

Rehearse this procedure once, against a disposable local database seeded via `npm run db:seed`, and record the actual wall-clock time and any step that didn't work as written. That measured number — not an estimate — is what should replace "Undefined / operator-dependent" in the RTO row of `docs/DATABASE_BACKUP_RUNBOOK.md`.
