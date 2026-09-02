# ShortFactory — TODO

## Current phase: PHASE 1 — FOUNDATION

- [x] Analyze repository and environment.
- [x] Read the complete project specification.
- [x] Create architecture, plan, TODO and decision records.
- [x] Bootstrap pnpm/Turborepo workspace.
- [x] Add validated config and redacting structured logger.
- [x] Add database and queue provider boundaries with local adapters.
- [x] Add API/dashboard/worker entrypoints.
- [x] Add Docker Compose for PostgreSQL and Redis.
- [x] Install dependencies and run the full check suite.
- [x] Verify API, dashboard and both worker entrypoints locally; document unavailable Docker infrastructure.

## PHASE 1 result

PHASE 1 acceptance criteria are satisfied for the available environment. Docker Compose is configured for real PostgreSQL/Redis, but Docker is not installed on this host, so the Compose topology remains unexecuted here.

## Deferred to later phases

- [ ] Core domain schema and migrations (Phase 2).
- [ ] Cost control and rights gate (Phases 3–4).
- [ ] FFmpeg rendering and QC (Phase 5).
- [ ] AI/transcription/planning providers (Phase 6).
- [ ] Review, scheduling, publishing and analytics (Phases 7–12).
