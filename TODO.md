# ShortFactory — TODO

## Current phase: PHASE 7 — REVIEW DASHBOARD

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

## PHASE 3 result

- [x] Add cost-control package with PostgreSQL and in-memory ledgers.
- [x] Add idempotent reservations and atomic hard-stop enforcement.
- [x] Add commit/release and cost logging paths.
- [x] Add 50/75/90/100% warnings and month-end forecast.
- [x] Add API forecast/reservation endpoints.
- [x] Test artificial €1 budget exhaustion and duplicate reservations.

PHASE 3 acceptance criteria are satisfied by unit/API coverage. Real PostgreSQL execution remains pending Docker availability; Compose includes all migrations before API startup.

## PHASE 4 result

- [x] Add central rights gate and explicit rights error taxonomy.
- [x] Enforce `BLOCKED` rejection before video/render creation.
- [x] Prevent `UNKNOWN` and review-required assets from auto-publishing.
- [x] Add Creative Commons approval/attribution policy support.
- [x] Add rights warning to dashboard and documentation.
- [x] Add gate and API safety tests.

## PHASE 5 result

- [x] Add path-safe local storage provider and retention cleanup hook.
- [x] Add FFprobe media inspection and FFmpeg crop/trim rendering.
- [x] Add optional ASS subtitle burn-in and AAC audio normalization.
- [x] Add critical media QC checks and render-worker integration.
- [x] Verify landscape fixture renders to a valid 1080x1920 H.264/AAC MP4.
- [x] Install FFmpeg/FFprobe in the shared Docker image used by the render worker.

PHASE 5 acceptance criteria are satisfied by the automated fixture test and full local check suite. Docker runtime verification remains pending because Docker is unavailable on this host.

## PHASE 6 result

- [x] Add timestamped transcription provider contract and deterministic adapter.
- [x] Add transcription cache keyed by media hash, language and model.
- [x] Add Zod-validated analysis and content-planning outputs.
- [x] Add bounded retries for invalid analysis/planning provider output.
- [x] Add AI cost measurement interface and in-memory meter.
- [x] Add explicit disabled TTS provider contract.
- [x] Wire the AI pipeline into the light worker boundary.
- [x] Test candidate → transcript → analysis → plan and retry behavior.

PHASE 6 acceptance criteria are satisfied by the pipeline tests and full local check suite. Paid provider credentials remain runtime-only and no external provider call is made by the deterministic adapters.

PHASE 4 acceptance criteria are satisfied by unit/API coverage. Rights decisions are explicit and do not assume that editing makes third-party content legal.

## Deferred to later phases

- [x] Core domain schema and migrations (Phase 2).
- [x] Cost control (Phase 3).
- [x] Rights gate (Phase 4).
- [x] Media engine and QC (Phase 5).
- [x] FFmpeg rendering and QC (Phase 5).
- [x] AI/transcription/planning providers (Phase 6).
- [ ] Review, scheduling, publishing and analytics (Phases 7–12).
