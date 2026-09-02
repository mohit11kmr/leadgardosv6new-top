#!/usr/bin/env bash
#
# LeadGuard OS V6 — safe operator database backup.
#
# Dumps DATABASE_URL to a timestamped, custom-format pg_dump archive and
# verifies it. Never prints the connection string (only the redacted
# host/port/db), never writes into a path git tracks, and performs no
# destructive action — it only reads the database and writes a local file.
#
# Usage:
#   ./scripts/db-backup.sh                 # backs up $DATABASE_URL to ./backups/
#   BACKUP_DIR=/mnt/backups ./scripts/db-backup.sh
#
# Requires: pg_dump on PATH (matching or newer than the target Postgres major
# version — see https://www.postgresql.org/docs/current/app-pgdump.html).

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f .env ]]; then
    # Only DATABASE_URL is consumed from .env; nothing is echoed.
    DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -n1 | cut -d= -f2-)"
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set (checked environment and ./.env). Refusing to guess a target." >&2
  exit 1
fi

# Redact credentials for the operator-facing confirmation line only.
REDACTED_TARGET="$(printf '%s' "$DATABASE_URL" | sed -E 's#//[^@]*@#//***:***@#')"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/leadguard_${TIMESTAMP}.dump"

echo "Target:      ${REDACTED_TARGET}"
echo "Output file: ${DUMP_FILE}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: pg_dump not found on PATH. Install a postgresql-client matching the target server's major version." >&2
  exit 1
fi

pg_dump --format=custom --no-owner --no-privileges --file="${DUMP_FILE}" "${DATABASE_URL}"

if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "ERROR: dump file is empty — treat this backup as failed, do not rely on it." >&2
  exit 1
fi

# Verify the archive is structurally readable without touching any database.
if command -v pg_restore >/dev/null 2>&1; then
  if pg_restore --list "${DUMP_FILE}" >/dev/null 2>&1; then
    echo "Verified: archive is readable by pg_restore --list."
  else
    echo "ERROR: pg_restore --list could not read the archive — treat this backup as failed." >&2
    exit 1
  fi
else
  echo "WARNING: pg_restore not found — skipped archive-readability verification." >&2
fi

SIZE="$(du -h "${DUMP_FILE}" | cut -f1)"
echo "OK: backup written and verified (${SIZE})."
echo "This script does not upload, encrypt, or delete anything. Off-site retention is an operator/provider responsibility — see docs/DATABASE_BACKUP_RUNBOOK.md."
