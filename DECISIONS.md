# ShortFactory — Decision Log

## 2026-09-02 — TypeScript monorepo with pnpm and Turborepo

- Decision: Use pnpm workspaces with Turborepo and TypeScript strict mode.
- Reason: This matches the specification, keeps shared contracts versioned in one repository, and leaves a low-friction path to separate render workers later.
- Alternatives considered: npm workspaces (less task orchestration), Nx (more framework and configuration than needed for the MVP).
- Consequences: Workspace scripts and package boundaries must remain explicit; CI will use pnpm and the pinned package manager version.

## 2026-09-02 — Fastify for the API

- Decision: Use Fastify for the HTTP API.
- Reason: It is lightweight, TypeScript-friendly, and provides a small surface for the foundation while supporting validation and plugins later.
- Alternatives considered: NestJS (more opinionated structure, not needed before domain complexity exists).
- Consequences: Business services remain outside route handlers as the API grows.

## 2026-09-02 — Explicit local adapters for unavailable infrastructure

- Decision: Add `memory` and `mock` adapters for local development while keeping PostgreSQL/Redis as the Docker/production modes.
- Reason: Docker is unavailable in the current environment, but the service shell and tests must still be runnable. The mode is visible in readiness output and is never presented as a real dependency.
- Alternatives considered: Make external services mandatory (blocks local verification), silently swallow connection failures (unsafe false-green health).
- Consequences: Production deployments must set `DATABASE_MODE=postgres` and `QUEUE_MODE=redis`; Phase 2 will make persistence mandatory for domain operations.

## 2026-09-02 — Drizzle ORM for the core domain

- Decision: Use Drizzle ORM with the node-postgres driver and checked-in SQL migrations.
- Reason: It preserves typed table definitions, explicit SQL migrations and a small runtime footprint suited to the €50/month constraint.
- Alternatives considered: Prisma (heavier generated client/runtime), raw SQL only (less type safety and weaker repository ergonomics).
- Consequences: Schema changes must update `schema.ts` and produce a new migration; migrations run through the explicit database command before API startup in Compose.

## 2026-09-02 — Reservations as a first-class cost-control record

- Decision: Persist cost reservations separately from final cost events, keyed by an idempotency key.
- Reason: A worker can be retried after reserving but before committing; the reservation record prevents double-reserving and lets failures release capacity safely.
- Alternatives considered: Incrementing `budgets.reserved_eur` without a record (cannot reconcile retries), checking budget only at commit (allows concurrent overspend).
- Consequences: The Phase 3 migration adds `cost_reservations`; PostgreSQL reserve/commit/release operations use transactions and conditional updates.

## 2026-09-02 — FFmpeg as the render-worker media engine

- Decision: Use FFprobe for inspection and FFmpeg with H.264/AAC output for the first media engine; subtitles are rendered through temporary ASS files.
- Reason: Both tools are mature, available in the Alpine render image, and cover crop, trim, caption burn-in, audio normalization and deterministic QC without a paid media service.
- Alternatives considered: A hosted media API (adds recurring cost and external dependency), browser-side rendering (not suitable for worker reliability or rights controls).
- Consequences: Render jobs must use absolute paths from a storage adapter, outputs are accepted only after critical QC passes, and the Docker image includes FFmpeg/FFprobe.

## 2026-09-02 — Redis-coordinated provider rate limiting

- Decision: Enforce publishing limits through one provider/account limiter shared by the scheduler, with Redis coordination in production and an in-memory implementation for tests.
- Reason: Limits must remain correct across multiple publisher workers and must honor provider retry timing instead of being silently distributed per process.
- Alternatives considered: Worker-local counters (incorrect across replicas), browser automation or retry loops that bypass provider limits (not permitted).
- Consequences: A rate-limited publication returns `retryAfterMs`; callers reschedule it. Redis is required for distributed production operation.

## 2026-09-02 — Explicit operational safety controls

- Decision: Add request limits, secure headers, correlation/audit logs, metrics, dead-letter retention and explicit backup/restore scripts before declaring the system production-ready.
- Reason: A resumable pipeline needs observable failures and recoverable state; destructive restore operations must require an explicit confirmation flag.
- Alternatives considered: Logging only to stdout without correlation, dropping permanent failures, relying on unversioned database snapshots.
- Consequences: Operators use `docs/RUNBOOK.md`; backup storage and scheduler/cron execution remain deployment responsibilities.

## 2026-09-02 — R2/S3-compatible storage as the first remote adapter

- Decision: Keep local storage as the explicit development default and select Cloudflare R2/S3-compatible storage only when the complete runtime configuration is present.
- Reason: The specification requires remote object storage while local tests must remain deterministic and must not fabricate credentials.
- Consequences: `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY` and `R2_SECRET_KEY` are runtime-only; readiness reports local storage as degraded and remote storage as ready only when configured.

## 2026-09-02 — Queue consumers with bounded retries and DLQ retention

- Decision: Workers consume BullMQ jobs through a shared queue boundary, with three attempts and terminal failure retention under a per-queue dead-letter queue.
- Reason: The orchestrator already emits idempotent jobs; a runnable consumer boundary is required for operational recovery and does not couple workers to the API.
- Consequences: Production uses Redis/BullMQ; mock mode remains a no-op consumer for deterministic local startup and tests.

## 2026-09-02 — Typed worker payload progression

- Decision: Queue consumers process complete payloads locally and enqueue the next-stage result with the original correlation ID and a deterministic idempotency key; incomplete orchestration-only payloads are explicitly deferred.
- Reason: The daily orchestrator intentionally schedules capacity before a candidate/media identity exists. Treating those capacity jobs as failed would fill the DLQ; silently acknowledging them would hide missing work.
- Consequences: Discovery, AI, render, publish, analytics and cleanup can be exercised independently with complete payloads, while a repository-backed batch materializer remains the deployment integration point for populating stage-specific payloads.

### Shared worker lifecycle audit

All queue consumers are wrapped by a database-backed audit boundary that records lifecycle events, correlation/idempotency metadata and UUID entity references in `jobs_audit`. Audit write failures are fail-open so an unavailable audit table cannot conceal or transform the original business error; the original queue retry/DLQ policy remains authoritative.
### Runtime publisher adapter selection

The publisher worker selects the official YouTube, TikTok or Instagram adapter only when that platform has the credentials required for an API call. Missing credentials keep the local mock adapter active, preserving deterministic development and test behavior without silently attempting browser automation.

### Optional API-key RBAC boundary

The API supports an explicit `AUTH_MODE=api-key` deployment mode with separate ADMIN, EDITOR and VIEWER runtime keys. Local development remains disabled by default, while production deployments can enforce read/write separation without introducing browser-stored secrets or cookie-based sessions.

### Optional premium TTS adapter

The TTS boundary keeps deterministic and disabled providers available, and adds an official ElevenLabs HTTP adapter selected only when `TTS_API_KEY` and `TTS_VOICE_ID` are configured. The adapter estimates cost before synthesis, writes returned audio under an explicit runtime directory and is wrapped by the worker's reservation/commit/release gate. Missing credentials defer the job instead of triggering an external call.

### Typed experiment metadata in video metadata

Video experiment fields are represented by a shared TypeScript contract and persisted inside the existing versioned metadata JSON rather than adding a migration for each new editorial dimension. Analytics aggregates available `formatId` values by channel and format, so A/B learning compares distinct videos without creating duplicate publications.

### API-backed operator configuration

The dashboard reads analytics, costs and platform accounts through API resources and writes channel production settings through the validated channel endpoint. Global kill switches have a separate admin-only runtime endpoint; they intentionally do not persist across restarts, so deployment configuration remains the durable safety default and secrets never enter the browser or database.
