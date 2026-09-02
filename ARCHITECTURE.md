# ShortFactory — Architecture

ShortFactory is a TypeScript monorepo designed for a single VPS first and horizontal worker scaling later. The implementation keeps API, dashboard and queue workers separate while sharing typed domain contracts, persistence, storage, media, cost and rights boundaries.

## Runtime topology

```text
Browser → nginx (optional) → dashboard (Next.js)
                         └→ api (Fastify)
                               ├→ database adapter → PostgreSQL
                               └→ queue adapter    → Redis/BullMQ

orchestrator-worker / discovery / ingestion / transcription / analysis / planning / tts / render / qc / review / publish / analytics / cleanup workers → queue adapter → Redis/BullMQ
```

The API never performs heavy FFmpeg work. Render work has a separate worker boundary so it can move to a dedicated host without changing business interfaces.

## Repository boundaries

- `apps/api`: HTTP transport, health/readiness composition, and future application services.
- `apps/dashboard`: Next.js operator dashboard with overview, channels, candidates, videos, review, publishing, analytics, costs, sources, accounts, settings and system-health sections.
- `workers/*`: process entrypoints and BullMQ consumers; each consumer validates its typed payload, executes the relevant package adapter and forwards durable output to the next queue when the payload is complete.
- `packages/config`: validated runtime configuration.
- `packages/logger`: Pino logger with secret redaction defaults.
- `packages/database`: Drizzle schema, versioned migrations, PostgreSQL repository and in-memory repository.
- `packages/queue`: BullMQ/Redis boundary with a deterministic mock for local development and tests.
- `packages/cost-control`: budget ledger, idempotent reservations, hard stop and forecast service.
- `packages/storage`: storage-provider contract, safe local filesystem adapter and Cloudflare R2/S3-compatible adapter with retention cleanup hooks.
- `packages/video`: FFprobe/FFmpeg renderer, subtitle presets/ASS caption burn-in, overlay/audio/compression/thumbnail support and deterministic media quality control.
- `packages/transcription`: timestamped transcription contract, deterministic local adapter and cache boundary.
- `packages/ai`: Zod-validated analysis/content-plan contracts, bounded retries, deterministic adapters and AI cost meter.
- `packages/tts`: replaceable TTS contract with pre-generation cost estimation, cache-by-content key, budget gate, deterministic adapter and explicit disabled adapter.
- `packages/platforms`: common publishing contract, independent mock publishers, timezone-aware scheduler/lock boundary and centralized in-memory/Redis provider rate limiter.
- `workers/tts-worker`: typed TTS queue consumer with cache-first deterministic local adapter and explicit deferral for unconfigured providers.
- `packages/analytics`: snapshot collection, PostgreSQL/in-memory stores, overview aggregation by platform/channel/experiment format and configurable normalized performance score.
- `packages/orchestrator`: daily target/buffer calculation, centralized pipeline queue scheduling, distributed-lock seam and idempotent job keys.
- `packages/shared`: cross-package types and error taxonomy.
- `infrastructure`: Docker Compose and future deployment scripts.

## Design constraints

Provider integrations use interfaces/adapters. Paid providers must be gated by cost control before execution. Rights and publication safety gates are enforced before render and publish operations. Secrets are runtime configuration only and are never logged or committed.

The render worker owns media processing and receives absolute input/output paths from a storage adapter. It crops landscape or portrait sources into the configured vertical canvas, optionally burns captions, normalizes audio, and runs FFprobe-based QC before a render is accepted. A render container includes FFmpeg and FFprobe; the local adapter remains usable for tests and development.

The light worker owns the candidate AI boundary. `AiPipeline` passes candidate metadata, channel configuration, performance context and a timestamped transcript to analysis; no video binary is sent to the LLM boundary. Transcription is cached by media hash, language and model. External analysis and planning responses must pass Zod schemas and have bounded retries before they can reach downstream rendering.

The dashboard review queue is the operator boundary: it reads videos through the API and exposes metadata editing, rerender, approve and reject actions. The Operations panel also runs a deterministic end-to-end test pipeline (candidate → analysis/plan → FFmpeg fixture → QC → storage preview) and schedules explicitly approved videos. It never accesses PostgreSQL directly. Rerender requests pass through the API rights gate and increment `renderVersion` so a retry cannot silently create an uncontrolled duplicate.

The API also exposes paginated operational records for platform accounts, source assets, transcripts, content plans and job audits. Video experiment metadata (`formatId`, `hookType`, caption style, duration bucket, voice and topic) is typed at the shared boundary and stored inside the versioned video metadata JSON, allowing analytics to compare formats without duplicating publications.

The publisher worker schedules approved videos through `PublishingScheduler`. YouTube, TikTok and Instagram are independent publisher instances; their results are retained separately and aggregate to `SUCCESS` or `PARTIAL_FAILURE`. Mock publishers return fake URLs. The official YouTube adapter uses OAuth and the Google resumable-upload HTTP flow only; credentials are runtime-only and its safe default is private. The official TikTok adapter uses OAuth plus Content Posting API Direct Post or Upload-to-Draft mode; it has no browser-login fallback. The official Instagram adapter uses the Meta Graph container → status → media_publish flow and reports `NEEDS_CONFIGURATION` when the professional account/app prerequisites are absent.

The analytics worker collects platform snapshots independently and persists them through the analytics store. Performance scoring is normalized and configurable; rights remain an absolute gate, so `BLOCKED` content scores zero regardless of performance.

The orchestrator worker runs the daily planning boundary. It calculates the active-channel target (default 3 × 6 = 18 unique videos), maintains a two-day ready buffer (36 videos), raises queue priority below one day of ready inventory, and reduces processing above 54 ready videos. It enqueues a deterministic batch job for each pipeline queue using an orchestration-date/channel/queue idempotency key. Redis/BullMQ applies the same key as the broker job ID and provides three attempts with exponential backoff; the in-memory adapter mirrors the contract for tests.

The API applies secure headers, a bounded request body, configurable request rate limiting, optional API-key RBAC, correlation/request response headers, redacted structured logs and a Prometheus-compatible `/metrics` endpoint. `/ready` reports PostgreSQL, Redis, storage, FFmpeg, workers, budget, LLM, TTS and platform states without presenting unvalidated integrations as green. Queue consumers use bounded retries and retain terminal failures in per-queue dead-letter queues with the original error and idempotency metadata. PostgreSQL backups use custom-format `pg_dump` with 7 daily and 4 weekly retention; restore requires an explicit confirmation flag.

## Local modes

`DATABASE_MODE=memory` and `QUEUE_MODE=mock` make the service shell runnable without Docker. They are explicit development adapters, not production fallbacks. Docker Compose sets PostgreSQL and Redis modes and readiness checks those real dependencies.
