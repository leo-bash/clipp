# Production runbook

## Startup and readiness

1. Copy `.env.example` to a runtime-only environment file and set PostgreSQL, Redis and provider credentials outside the repository.
2. Start the stack with `docker compose up -d postgres redis database-migrate api dashboard worker-light discovery-worker transcription-worker tts-worker analysis-worker script-worker worker-render qc-worker review-worker publisher-worker analytics-worker cleanup-worker orchestrator-worker nginx`.
3. Verify `GET /health` for liveness and `GET /ready` for PostgreSQL, Redis, storage, FFmpeg and provider readiness. A `503` from `/ready` means traffic should not be admitted; a `200` with `degraded` dependencies is expected until optional providers are configured and validated.
4. Verify `GET /metrics` and inspect `docker compose logs --since=10m api` for request/correlation IDs.

The local memory/mock adapters are for development and tests only. The Compose runtime has been verified with Colima/Docker on macOS ARM: PostgreSQL and Redis become healthy, `database-migrate` exits with code `0`, and API/dashboard/nginx are reachable. If the `docker compose` plugin is unavailable, the equivalent Homebrew command is `docker-compose`; both use the same Compose file.

## Backups and restore

Run `infrastructure/scripts/backup-postgres.sh` daily from cron or the host scheduler with `DATABASE_URL` and `BACKUP_DIR` set. The script keeps 7 daily files and 4 weekly files (weekly files are retained for 28 days). Store the backup directory in durable object storage with restricted access.

Test a restore at least monthly in an isolated PostgreSQL instance:

```sh
CONFIRM_RESTORE=YES DATABASE_URL="$RESTORE_DATABASE_URL" BACKUP_FILE="./backups/postgres/daily/example.dump" infrastructure/scripts/restore-postgres.sh
```

Never point the restore command at production without an explicit change window and a verified backup.

## Queue failures and DLQ

BullMQ jobs have three attempts and exponential backoff. A permanent failure must be moved to `<queue>.dead-letter` through `enqueueDeadLetter`, retaining the original queue, idempotency key, correlation ID, error and timestamp. Operators should inspect the payload, correct configuration or rights, then retry the original idempotent job; dismiss only after the failure is understood.

## Provider limits and publishing

The publishing scheduler runs the centralized provider/account limiter before calling an adapter. A rejected decision carries `retryAfterMs`; reschedule after that delay and do not bypass the limit. Partial platform failures do not invalidate successful publications. Never substitute browser automation for an unavailable official API.

## Incident checklist

- Check `/ready`, `/metrics`, CPU, memory, PostgreSQL and Redis health.
- Search logs by `requestId`, `correlationId`, `jobId`, `channelId`, `candidateId` or `videoId`.
- Check DLQ entries and last provider response without logging tokens.
- Pause the affected channel/platform before retrying repeated failures.
- Confirm rights status before re-rendering or publishing.
- Record the incident and any policy change in `DECISIONS.md`.
