# ShortFactory — Project Plan

## Milestones

| Phase | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation: monorepo, TypeScript, config, logger, database/Redis queue boundaries, Docker, health checks | Completed |
| 2 | Core domain: schema, seed data, channels/sources/candidates/videos/publications/costs/budgets CRUD | Completed |
| 3 | Cost engine and forecast | Completed |
| 4 | Rights safety gate | Completed |
| 5 | Storage, FFmpeg renderer and QC | Completed |
| 6 | Transcription, analysis and content planning adapters | Completed |
| 7 | Review dashboard | Completed |
| 8 | Mock publishers and scheduler | Completed |
| 9 | Official YouTube adapter | Completed |
| 10 | Official TikTok adapter | Completed |
| 11 | Official Instagram adapter | Completed |
| 12 | Analytics snapshots and performance scoring | Completed |
| 13 | Daily orchestrator, buffers and idempotent queue scheduling | Completed |
| 14 | Production hardening: security, backups, monitoring, rate limiting, DLQ and runbook | Completed |

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

## Phase 5 verification

`@shortfactory/storage` provides a path-safe local storage adapter with metadata and retention cleanup hooks. `@shortfactory/video` provides FFprobe probing, FFmpeg vertical rendering, optional ASS captions, AAC audio normalization and critical QC checks for resolution, duration, codec, audio and file size. The automated acceptance test generates a 1280x720 landscape fixture and verifies a valid 1080x1920 H.264/AAC MP4. The render worker imports the renderer, and the Docker image installs FFmpeg/FFprobe. The full check suite passes; Docker/PostgreSQL/Redis runtime execution remains pending because Docker is unavailable on this host.

## Phase 6 verification

`@shortfactory/transcription` exposes timestamped transcripts, a deterministic local adapter and a cache keyed by `mediaHash + language + model`. `@shortfactory/ai` orchestrates transcript → analysis → content plan, validates all external-shaped outputs with Zod, retries invalid analysis/planning output only within a bounded limit, and emits cost measurements. `@shortfactory/tts` exposes a replaceable provider contract with an explicit disabled implementation. The light worker imports the pipeline, and tests cover cache behavior, the candidate pipeline and retry bounds.

## Phase 7 verification

The dashboard has an operator review queue backed entirely by API calls. An operator can edit JSON metadata, request a rerender, approve or reject a video. The API persists video metadata, increments `renderVersion` for rerender requests, and re-applies the rights gate before rendering. API tests cover the review actions and the dashboard passes typecheck, lint and production build.

## Phase 8 verification

`@shortfactory/platforms` defines `PlatformPublisher` with account validation, cost estimation, publish, status and analytics methods. YouTube, TikTok and Instagram mocks publish independently with fake URLs. `PublishingScheduler` requires an approved, non-blocked video, uses configured channel timezone/slots and a lock boundary, and reports partial failure without losing successful results. The publisher worker imports the scheduler and Compose includes it.

## Phase 9 verification

`YouTubePublisher` implements OAuth authorization-code exchange, refresh-token rotation, credential validation, official `videos.insert`-compatible resumable upload initialization plus upload, status and statistics retrieval. It defaults to `private`, only sends `publishAt` for future private scheduling, requires an absolute media file path, and returns configuration/upload failures without browser automation. Tests verify the official upload sequence and private default.

## Phase 10 verification

`TikTokPublisher` implements OAuth code exchange/refresh, creator-info validation, Content Posting API Direct Post and Upload-to-Draft modes, chunked file transfer with `Content-Range`, and status polling through `status/fetch`. Direct Post uses the safe `SELF_ONLY` privacy level and can fall back to Upload-to-Draft only when configured and the API reports missing scope authorization. Tests verify the official direct-post initialization and transfer boundary.

## Phase 11 verification

`InstagramPublisher` implements the official Meta/Instagram Reels flow: create a public-URL media container, poll `status_code` until `FINISHED`/failure, then call `media_publish`. It validates configured credentials/account first, exposes basic media insights, and returns `NEEDS_CONFIGURATION` without making calls when prerequisites are absent. Polling attempts and interval are configurable, and tests cover the full container flow and missing-prerequisite path.

## Phase 12 verification

`@shortfactory/analytics` collects minimum platform metrics into the existing PostgreSQL `analytics_snapshots` table or an in-memory adapter, exposes an overview aggregation through `/api/v1/analytics/overview`, and supports publication-specific snapshots. `computePerformanceScore` normalizes views, engagement, completion, follower conversion and editorial signals using configurable weights, while `BLOCKED` rights always return zero. The dashboard displays the overview counters and the analytics worker owns collection.

## Next milestone

Phase 13 verification

`@shortfactory/orchestrator` calculates the active-channel daily target, defaulting to 18 videos for three channels, maintains a 36-video ready buffer, marks a run HIGH priority below 18 ready videos, and switches to REDUCE above 54. It schedules all twelve pipeline queues with deterministic idempotency keys, queue retries and exponential backoff. Tests cover target calculation, all queue stages, retry-safe re-entry and upper-buffer throttling. The orchestrator worker is included in the Compose topology.

## Phase 14 verification

API hardening adds Helmet, CORS, request body limits, configurable Fastify request rate limiting, request/correlation headers, redacted structured audit logs and a Prometheus-compatible metrics endpoint. Provider publishing uses a centralized per-provider/account limiter with an in-memory test adapter and Redis/Lua coordination adapter, including `retryAfterMs`. BullMQ and the mock queue expose dead-letter retention. PostgreSQL backup and explicitly confirmed restore scripts implement 7 daily/4 weekly retention. CI runs the full check suite, and `docs/RUNBOOK.md` documents startup, readiness, backups, DLQ handling and incidents.

All implementation phases are complete. The only environment-level verification still unavailable is live Docker Compose execution because Docker is not installed on this host.
