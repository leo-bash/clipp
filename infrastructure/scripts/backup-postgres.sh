#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAILY_FILE="${BACKUP_DIR}/daily/shortfactory-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"
pg_dump --format=custom --no-owner --no-privileges --file "${DAILY_FILE}" "${DATABASE_URL}"

if [[ "$(date -u +%u)" == "7" ]]; then
  cp "${DAILY_FILE}" "${BACKUP_DIR}/weekly/shortfactory-${TIMESTAMP}.dump"
fi

find "${BACKUP_DIR}/daily" -type f -name '*.dump' -mtime +7 -delete
find "${BACKUP_DIR}/weekly" -type f -name '*.dump' -mtime +28 -delete
echo "PostgreSQL backup created: ${DAILY_FILE}"
