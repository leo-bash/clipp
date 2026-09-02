# Troubleshooting

- If Docker is unavailable, use `DATABASE_MODE=memory QUEUE_MODE=mock pnpm dev`.
- If `/ready` is `down`, inspect PostgreSQL and Redis health before retrying workers.
- If a provider credential is missing, keep the adapter disabled/mock; do not add secrets to source files.
