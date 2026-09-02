# ShortFactory — Project Plan

## Milestones

| Phase | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation: monorepo, TypeScript, config, logger, database/Redis queue boundaries, Docker, health checks | Completed |
| 2 | Core domain: schema, seed data, channels/sources/candidates/videos/publications/costs/budgets CRUD | Completed |
| 3 | Cost engine and forecast | Completed |
| 4 | Rights safety gate | Completed |
| 5 | Storage, FFmpeg renderer and QC | Pending |
| 6 | Transcription, analysis and content planning adapters | Pending |
| 7 | Review dashboard | Pending |
| 8 | Mock publishers and scheduler | Pending |
| 9–14 | Official platform adapters, analytics, orchestrator and production hardening | Pending |

## Phase 1 exit criteria

- Workspace installs with pnpm.
- API, dashboard and worker entrypoints have build/dev scripts.
- Configuration is validated and secrets are represented only by `.env.example`.
- Structured logger, database adapter and queue adapter are shared packages.
- Docker Compose defines PostgreSQL and Redis with health checks.
- API `/health` and `/ready` endpoints are covered by tests.
- lint, typecheck, tests and builds pass.

## Phase 1 verification

`pnpm check` passes (lint, strict typecheck, tests and builds). API, dashboard and both worker entrypoints start in explicit local adapters. Docker Compose could not be executed because Docker is not installed on the current host.

## Phase 2 verification

Drizzle schema and versioned migration cover the 14 entities from the specification. PostgreSQL and in-memory repositories expose the core domain operations; the API exposes validated, paginated CRUD/state endpoints under both `/` and `/api/v1`. Seed data is idempotent, and the dashboard reads the three seeded channels through the API. `drizzle-kit check` and the full `pnpm check` pass. Real PostgreSQL execution remains pending Docker availability on this host.

## Phase 3 verification

`CostControlService` implements reservations, idempotency, commit/release, hard stop and forecast thresholds. The API exposes forecast and reservation endpoints, while PostgreSQL uses atomic budget updates and the `cost_reservations` migration. Tests verify a €1 budget stops the next job, duplicate reservation keys do not double-reserve, releases restore capacity, and forecast warnings are emitted.

## Phase 4 verification

`RightsGate` implements the required rights matrix. `BLOCKED` is rejected before video/render creation; `UNKNOWN`, `COMMENTARY_REVIEW` and unapproved Creative Commons assets require manual review; auto-publish is disabled whenever policy requires review. API and gate tests cover the safety boundary.

## Next milestone

Phase 5 will add storage, FFprobe/FFmpeg rendering and automatic QC without changing the Phase 4 process boundaries.
