#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${BACKUP_FILE:?BACKUP_FILE must point to a custom-format pg_dump file}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
CONFIRM_RESTORE="${CONFIRM_RESTORE:-NO}"

if [[ "${CONFIRM_RESTORE}" != "YES" ]]; then
  echo "Refusing restore: set CONFIRM_RESTORE=YES explicitly." >&2
  exit 2
fi

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "${DATABASE_URL}" "${BACKUP_FILE}"
echo "PostgreSQL restore completed from: ${BACKUP_FILE}"
