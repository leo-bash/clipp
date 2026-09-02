# ShortFactory — TODO

## Current phase: PHASE 2 — CORE DOMAIN

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

## PHASE 2 result

- [x] Add Drizzle schema and versioned core-domain migration for all required entities.
- [x] Add PostgreSQL and in-memory domain repositories.
- [x] Add idempotent seed for 3 channels, 5 sources and demo candidate.
- [x] Add validated paginated CRUD/state API for core entities.
- [x] Connect dashboard channel view to the API.
- [x] Add domain/API tests and run `drizzle-kit check`.
- [x] Run full lint, typecheck, test and build suite.

PHASE 2 acceptance criteria are satisfied in the available environment. Live PostgreSQL migration/seed execution is pending Docker availability; the Compose path is configured.

## Deferred to later phases

- [x] Core domain schema and migrations (Phase 2).
- [ ] Cost control and rights gate (Phases 3–4).
- [ ] FFmpeg rendering and QC (Phase 5).
- [ ] AI/transcription/planning providers (Phase 6).
- [ ] Review, scheduling, publishing and analytics (Phases 7–12).
