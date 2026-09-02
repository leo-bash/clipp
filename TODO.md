# ShortFactory — TODO

## Current phase: PHASE 15 — SPECIFICATION AUDIT CLOSURE

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

## PHASE 7 result

- [x] Add dashboard review queue with API-backed video list.
- [x] Add metadata JSON editing from the dashboard.
- [x] Add approve/reject actions.
- [x] Add rights-gated rerender action with `renderVersion` increment.
- [x] Persist video metadata with a versioned PostgreSQL migration.
- [x] Test the review action API and build the dashboard.

PHASE 7 acceptance criteria are satisfied by API coverage and the dashboard production build. The queue is intentionally API-only from the browser; no direct database access is exposed.

## PHASE 8 result

- [x] Add common `PlatformPublisher` contract.
- [x] Add YouTube, TikTok and Instagram mock publishers with fake URLs.
- [x] Add timezone-aware configurable-slot scheduler.
- [x] Add distributed-lock seam and in-memory implementation.
- [x] Require approved, non-blocked videos before mock publication.
- [x] Preserve independent platform results and expose partial failure.
- [x] Add publisher worker and Compose service.
- [x] Test approved video → scheduled → three successful mock publications.

PHASE 8 acceptance criteria are satisfied by the scheduler tests and full local check suite. No external platform account or browser automation is used.

## PHASE 9 result

- [x] Add official YouTube OAuth code exchange and refresh-token methods.
- [x] Add account credential validation through the YouTube Data API.
- [x] Add resumable upload initialization and file transfer through official endpoints.
- [x] Default uploads to private and support future private scheduling.
- [x] Add official status and statistics retrieval.
- [x] Require absolute file paths and keep credentials out of logs/source control.
- [x] Test the official upload request sequence with a mocked HTTP boundary.

PHASE 9 acceptance criteria are satisfied by the adapter tests and full local check suite. Real YouTube credentials are intentionally not configured; no public upload is attempted.

## PHASE 10 result

- [x] Add official TikTok OAuth code exchange and refresh-token methods.
- [x] Add creator-info validation through Content Posting API.
- [x] Add configurable Direct Post and Upload-to-Draft modes.
- [x] Add chunked FILE_UPLOAD transfer with Content-Range headers.
- [x] Add status polling through the official status/fetch endpoint.
- [x] Add configured fallback from Direct Post to Upload-to-Draft for missing scope authorization.
- [x] Test official direct-post initialization and transfer with a mocked HTTP boundary.

PHASE 10 acceptance criteria are satisfied by the adapter tests and full local check suite. TikTok credentials, scopes and app approval remain runtime/account configuration; no browser automation is used.

## PHASE 11 result

- [x] Add official Instagram Graph API publisher for Reels.
- [x] Add professional-account/app prerequisite validation.
- [x] Add media container creation from a public media URL.
- [x] Add bounded status polling and media publish finalization.
- [x] Add basic media insights retrieval.
- [x] Return `NEEDS_CONFIGURATION` explicitly when credentials/account are absent.
- [x] Test container → status → publish and missing configuration.

PHASE 11 acceptance criteria are satisfied by the adapter tests and full local check suite. Instagram credentials, professional account status and Meta permissions remain runtime configuration; the adapter never automates login through a browser.

## PHASE 12 result

- [x] Add analytics snapshot contract and in-memory/PostgreSQL stores.
- [x] Collect platform metrics independently with partial-failure reporting.
- [x] Add normalized configurable performance score.
- [x] Keep rights as a hard gate in performance scoring.
- [x] Add API overview/publication analytics endpoints.
- [x] Add dashboard overview counters and analytics worker boundary.
- [x] Test snapshot collection, overview-ready data and scoring.

PHASE 12 acceptance criteria are satisfied by analytics/API tests and the full local check suite. External platform analytics calls remain gated by runtime credentials and official adapter availability.

## PHASE 13 result

- [x] Add daily target calculation for active channels (default 3 × 6 = 18 videos/day).
- [x] Add two-day ready buffer target (36 videos) and high/low processing thresholds.
- [x] Add centralized scheduling across discovery, ingestion, transcription, analysis, planning, tts, render, qc, review, publish, analytics and cleanup queues.
- [x] Add deterministic orchestration-date/channel/queue idempotency keys.
- [x] Configure BullMQ retries, exponential backoff and priority propagation.
- [x] Add distributed-lock and idempotency-store seams with deterministic tests.
- [x] Add orchestrator worker and Compose service.

PHASE 13 acceptance criteria are satisfied by orchestrator tests and the full local check suite. The worker is intentionally a scheduling boundary; domain repositories and downstream workers consume the emitted jobs independently.

PHASE 4 acceptance criteria are satisfied by unit/API coverage. Rights decisions are explicit and do not assume that editing makes third-party content legal.

## Deferred to later phases

- [x] Core domain schema and migrations (Phase 2).
- [x] Cost control (Phase 3).
- [x] Rights gate (Phase 4).
- [x] Media engine and QC (Phase 5).
- [x] FFmpeg rendering and QC (Phase 5).
- [x] AI/transcription/planning providers (Phase 6).
- [x] Review dashboard (Phase 7).
- [x] Mock scheduling and publishing (Phase 8).
- [x] Official YouTube publishing boundary (Phase 9).
- [x] Official TikTok publishing boundary (Phase 10).
- [x] Official Instagram publishing boundary (Phase 11).
- [x] Analytics snapshots and scoring (Phase 12).
- [x] Daily orchestrator and buffer management (Phase 13).
- [x] Production hardening, backup scripts, monitoring, rate limiting, DLQ and runbook (Phase 14).

## Phase 14 — production hardening

- [x] Add centralized provider rate limiting and Retry-After handling.
- [x] Add security controls, audit logging and request limits.
- [x] Add dead-letter queue handling and retained failure metadata.
- [x] Add daily PostgreSQL backup/restore scripts with 7 daily/4 weekly retention policy.
- [x] Add Prometheus-compatible metrics, CI and production readiness runbook.

PHASE 14 acceptance criteria are satisfied by the API/platform/queue tests and the full local check suite. Backup/restore and Redis/PostgreSQL production paths are configured but cannot be live-executed here because Docker is unavailable.

## PHASE 15 — specification audit closure

- [x] Add discovery provider contract and URL/external-id/content-hash duplicate detection.
- [x] Add R2/S3-compatible storage and configuration-based local/remote selection.
- [x] Add TTS estimated-cost, cache key and budget-gate contracts.
- [x] Add subtitle presets, safe-zone wrapping, overlays, audio volume, compression, metadata and thumbnail support.
- [x] Add global kill switches, model routing, analytics collection windows and expanded readiness checks.
- [x] Add queue consumer boundaries with retry and retained terminal failures.
- [x] Add dashboard navigation and operator forms for channels, sources, candidates, review, publishing, analytics, costs, settings and health.
- [x] Add versioned migrations for operational channel/source configuration, budget timestamps and duplicate URL uniqueness.
- [x] Complete the dashboard one-click test pipeline end to end: candidate actions, FFmpeg fixture render, QC, storage preview, review and manual scheduling.
- [x] Complete typed business processors for every queue consumer: discovery, ingestion/AI, transcription, analysis, planning, render, publishing, analytics, cleanup and orchestration now execute complete payloads or explicitly defer incomplete jobs.
- [ ] Run Docker Compose, PostgreSQL migration/seed and Redis integration on a host with Docker.

PHASE 15 remains open until runtime integration checks are complete.
