# ShortFactory — Architecture

## Phase 1 scope

ShortFactory is a TypeScript monorepo designed for a single VPS first and horizontal worker scaling later. Phase 1 establishes process boundaries, configuration, structured logging, persistence/queue interfaces, and health checks. Domain models and CRUD are intentionally deferred to Phase 2.

## Runtime topology

```text
Browser → nginx (optional) → dashboard (Next.js)
                         └→ api (Fastify)
                               ├→ database adapter → PostgreSQL
                               └→ queue adapter    → Redis/BullMQ

orchestrator-worker / worker-light / worker-render / publisher-worker / analytics-worker → queue adapter → Redis/BullMQ
```

The API never performs heavy FFmpeg work. Render work has a separate worker boundary so it can move to a dedicated host without changing business interfaces.

## Repository boundaries

- `apps/api`: HTTP transport, health/readiness composition, and future application services.
- `apps/dashboard`: Next.js shell for the operational dashboard.
- `workers/*`: process entrypoints; business logic will live in packages, not worker bootstraps.
- `packages/config`: validated runtime configuration.
- `packages/logger`: Pino logger with secret redaction defaults.
- `packages/database`: Drizzle schema, versioned migrations, PostgreSQL repository and in-memory repository.
- `packages/queue`: BullMQ/Redis boundary with a deterministic mock for local development and tests.
- `packages/cost-control`: budget ledger, idempotent reservations, hard stop and forecast service.
- `packages/storage`: storage-provider contract and safe local filesystem adapter with retention cleanup hooks.
- `packages/video`: FFprobe/FFmpeg renderer, ASS caption burn-in and deterministic media quality control.
- `packages/transcription`: timestamped transcription contract, deterministic local adapter and cache boundary.
- `packages/ai`: Zod-validated analysis/content-plan contracts, bounded retries, deterministic adapters and AI cost meter.
- `packages/tts`: replaceable TTS contract with an explicit disabled adapter.
- `packages/platforms`: common publishing contract, independent mock publishers, timezone-aware scheduler/lock boundary and centralized in-memory/Redis provider rate limiter.
- `packages/analytics`: snapshot collection, PostgreSQL/in-memory stores, overview aggregation and configurable normalized performance score.
- `packages/orchestrator`: daily target/buffer calculation, centralized pipeline queue scheduling, distributed-lock seam and idempotent job keys.
- `packages/shared`: cross-package types and error taxonomy.
- `infrastructure`: Docker Compose and future deployment scripts.

## Design constraints

Provider integrations use interfaces/adapters. Paid providers must be gated by cost control before execution. Rights and publication safety gates belong in domain/application packages in later phases. Secrets are runtime configuration only and are never logged or committed.

The render worker owns media processing and receives absolute input/output paths from a storage adapter. It crops landscape or portrait sources into the configured vertical canvas, optionally burns captions, normalizes audio, and runs FFprobe-based QC before a render is accepted. A render container includes FFmpeg and FFprobe; the local adapter remains usable for tests and development.

The light worker owns the candidate AI boundary. `AiPipeline` passes candidate metadata, channel configuration, performance context and a timestamped transcript to analysis; no video binary is sent to the LLM boundary. Transcription is cached by media hash, language and model. External analysis and planning responses must pass Zod schemas and have bounded retries before they can reach downstream rendering.

The dashboard review queue is the operator boundary: it reads videos through the API and exposes metadata editing, rerender, approve and reject actions. It never accesses PostgreSQL directly. Rerender requests pass through the API rights gate and increment `renderVersion` so a retry cannot silently create an uncontrolled duplicate.

The publisher worker schedules approved videos through `PublishingScheduler`. YouTube, TikTok and Instagram are independent publisher instances; their results are retained separately and aggregate to `SUCCESS` or `PARTIAL_FAILURE`. Mock publishers return fake URLs. The official YouTube adapter uses OAuth and the Google resumable-upload HTTP flow only; credentials are runtime-only and its safe default is private. The official TikTok adapter uses OAuth plus Content Posting API Direct Post or Upload-to-Draft mode; it has no browser-login fallback. The official Instagram adapter uses the Meta Graph container → status → media_publish flow and reports `NEEDS_CONFIGURATION` when the professional account/app prerequisites are absent.

The analytics worker collects platform snapshots independently and persists them through the analytics store. Performance scoring is normalized and configurable; rights remain an absolute gate, so `BLOCKED` content scores zero regardless of performance.

The orchestrator worker runs the daily planning boundary. It calculates the active-channel target (default 3 × 6 = 18 unique videos), maintains a two-day ready buffer (36 videos), raises queue priority below one day of ready inventory, and reduces processing above 54 ready videos. It enqueues a deterministic batch job for each pipeline queue using an orchestration-date/channel/queue idempotency key. Redis/BullMQ applies the same key as the broker job ID and provides three attempts with exponential backoff; the in-memory adapter mirrors the contract for tests.

The API applies secure headers, a bounded request body, configurable request rate limiting, correlation/request response headers, redacted structured logs and a Prometheus-compatible `/metrics` endpoint. Queue failures can be retained in per-queue dead-letter queues with the original error and idempotency metadata. PostgreSQL backups use custom-format `pg_dump` with 7 daily and 4 weekly retention; restore requires an explicit confirmation flag.

## Local modes

`DATABASE_MODE=memory` and `QUEUE_MODE=mock` make the service shell runnable without Docker. They are explicit development adapters, not production fallbacks. Docker Compose sets PostgreSQL and Redis modes and readiness checks those real dependencies.
