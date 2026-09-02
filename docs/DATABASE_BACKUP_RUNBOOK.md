# Database Backup Runbook

**Status: CURRENT.** This document describes what actually exists in this repository today. It intentionally does not describe the aspirational multi-region/WAL-archiving/managed-failover architecture in `docs/BACKUP_RECOVERY.md` — that document is labeled as a target-state architecture, not current reality (see the note at its top). Do not follow `BACKUP_RECOVERY.md`'s restore commands assuming the infrastructure it describes exists; it doesn't yet.

## What exists today

- One local/dev Postgres instance (`docker-compose.yml`, port 15432) and whatever `DATABASE_URL` each environment is actually pointed at (`packages/config`). No managed Postgres provider is configured anywhere in this repository.
- No automated, scheduled backup job exists in this codebase. `apps/api/src/services/retentionService.ts` deletes old rows (per `docs/PRODUCTION_READINESS.md` retention policy) — that is data *purging*, not backup, and does not help recovery.
- A manual, operator-run backup tool now exists: `scripts/db-backup.sh`. It is not scheduled or wired into CI/CD; it must be run by a human (or a cron job an operator sets up) against whichever `DATABASE_URL` is active.

## Backup responsibility once a managed provider is chosen

If/when a managed Postgres provider is selected (see `docs/LEADGUARD_OS_BLUEPRINT.md` §11 for candidates), **that provider is the source of truth for backups**, not this repository:

- Render Postgres, Neon, Supabase, and RDS all provide automated daily backups and point-in-time recovery (PITR) as a paid-tier platform feature, configured in the provider's dashboard/IaC, not in application code.
- This repo's job at that point is limited to: documenting the provider's actual retention/PITR window here (once chosen), and keeping `scripts/db-backup.sh` as an independent, provider-agnostic safety net for exporting a portable snapshot (useful for migrating providers, or for a local audit copy) — not as the primary recovery mechanism.

## Using `scripts/db-backup.sh` today

```bash
./scripts/db-backup.sh                       # backs up $DATABASE_URL to ./backups/
BACKUP_DIR=/path/outside/repo ./scripts/db-backup.sh
```

- Reads `DATABASE_URL` from the environment or `.env` (never prints it — only a redacted host/port/db line).
- Writes a timestamped `pg_dump --format=custom` archive to `./backups/` (gitignored — never commit a database dump).
- Verifies the archive is non-empty and readable via `pg_restore --list` before reporting success.
- Performs no destructive action: it only reads from the database and writes a local file.
- Does **not** upload, encrypt, or rotate anything — those are still manual steps or a provider responsibility until automated (see "Not yet built" below).

## RPO / RTO — stated honestly

| Metric | Current value | Why |
|---|---|---|
| RPO (Recovery Point Objective) | **Undefined / operator-dependent** | No scheduled backup job exists; data loss window equals however long it's been since someone last ran `scripts/db-backup.sh` by hand |
| RTO (Recovery Time Objective) | **Undefined / operator-dependent** | No tested restore procedure has been run against this codebase's actual schema; see `docs/DATABASE_RESTORE_RUNBOOK.md` for the manual procedure, which has not yet been rehearsed |
| Recovery owner | **Not assigned** | No on-call/ownership rotation exists in this repository or its docs |

Do not report these as met SLAs until a scheduled backup job exists and at least one restore has actually been rehearsed and timed.

## Not yet built (requires a decision, tracked in the Phase 2 report)

- A scheduled backup job (cron, or a managed-provider's automated backup) — requires picking a deployment/DB provider first.
- Off-site/encrypted storage of the dump files `scripts/db-backup.sh` produces — currently they land on local disk only.
- A rehearsed, timed restore drill — see `docs/DATABASE_RESTORE_RUNBOOK.md`; this has not been executed against this codebase.
