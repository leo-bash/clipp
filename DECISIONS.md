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

### Password session and optional API-key boundary

The API supports two explicit access boundaries: `AUTH_MODE=password` for the single operator dashboard and `AUTH_MODE=api-key` for service or role-based access. Password mode stores only a scrypt hash, issues short-lived HttpOnly server sessions, revokes them on logout and writes login/access audit events to a JSONL file. Local tests may use `AUTH_MODE=disabled`; a deployed operator instance must configure a password hash or API keys.

- Reason: The dashboard needs a simple password gate without placing a reusable secret in browser storage. The server-side session map keeps the raw token out of logs and the hash out of the client.
- Alternatives considered: Browser-stored API keys, plaintext passwords, and a full multi-user identity provider. Those add exposure or operational scope beyond the current single-operator workflow.
- Consequences: Sessions are process-local and expire after `AUTH_SESSION_TTL_SECONDS`; a multi-instance deployment must later move sessions to a shared store or adopt an identity provider. `AUTH_AUDIT_LOG_PATH` must be kept outside version control.

### Optional premium TTS adapter

The TTS boundary keeps deterministic and disabled providers available, and adds an official ElevenLabs HTTP adapter selected only when `TTS_API_KEY` and `TTS_VOICE_ID` are configured. The adapter estimates cost before synthesis, writes returned audio under an explicit runtime directory and is wrapped by the worker's reservation/commit/release gate. Missing credentials defer the job instead of triggering an external call.

### Typed experiment metadata in video metadata

Video experiment fields are represented by a shared TypeScript contract and persisted inside the existing versioned metadata JSON rather than adding a migration for each new editorial dimension. Analytics aggregates available `formatId` values by channel and format, so A/B learning compares distinct videos without creating duplicate publications.

### API-backed operator configuration

The dashboard reads analytics, costs and platform accounts through API resources and writes channel production settings through the validated channel endpoint. Global kill switches have a separate admin-only runtime endpoint; they intentionally do not persist across restarts, so deployment configuration remains the durable safety default and secrets never enter the browser or database.

## 2026-10-18 — Reddit Stories pilot as the first editorial format

- Decision: Start the first real-world pilot in English with Reddit-style stories across a rotating set of themes (relationships, work, confessions and AITA), original voice-over, catchy subtitles and Orbital gameplay used under its stated reuse/monetization permission, using one channel and one platform with private/draft publication and mandatory human review.
- Reason: This removes dependence on a single streamer while keeping the editorial work visible: selection, rewriting, narration, pacing and conclusion. The theme rotation gives us an early comparison of audience demand without creating separate channels.
- Alternatives considered: Authorized streamer clips, tutorial-only content, or unverified reposts. Public Reddit posts and gameplay found online are not treated as automatically reusable commercial assets.
- Consequences: Every story needs a source and rights record; every gameplay asset needs the Orbital source URL, license wording and verification date, or purchase evidence. `UNKNOWN` and `BLOCKED` remain gated by the rights policy. The first implementation gap is real source/file ingestion into the existing pipeline; mock publishing is not considered a business result.

## 2026-10-18 — Local runner after 4K Video Downloader+ intake

- Decision: Keep 4K Video Downloader+ as the manual source-download step and automate everything after a video is saved locally with `pnpm pipeline:local`. The runner uses ElevenLabs for English voice-over, CaptionForge for local word timings, and FFmpeg for composition and QC.
- Reason: The downloader is a desktop application and the project does not depend on undocumented GUI automation. A watched/download folder is simple, auditable and reuses a long gameplay source across many short renders.
- Alternatives considered: Direct downloader scraping/CLI emulation, browser automation, or replacing the source step with an unverified downloader. These were rejected because they add fragility and can conflict with provider terms or rights tracking.
- Consequences: The operator still downloads and records the source URL/license in 4K Video Downloader+. The runner defaults rights to `UNKNOWN`, marks the output for manual review, never publishes automatically, and stores a manifest under `.data/local-pipeline/<run>/`. Gemini is now configured as the script adapter for the local pilot; its key remains local-only and is never written to manifests or committed files.

## 2026-10-18 — One-command local generation and source segment ledger

- Decision: Make `pnpm generate` the one-command local entry point. It selects the newest video from `~/Movies/4K Video Downloader+`, allocates a segment not present in the adjacent `source-usage.txt`, generates the story/title/voice/captions, and reports the final video path.
- Reason: The operator should not need to remember source paths, timestamps, provider order or intermediate commands. A plain-text ledger makes source reuse visible and auditable.
- Consequences: Successful and in-progress intervals are reserved, so a later run never silently reuses a segment. Every run gets a `pipeline.log`, a manifest and stage-specific error output. Publication remains outside this command and rights `UNKNOWN` remains a manual-review gate.

## 2026-10-18 — Reddit source selection and original adaptation

- Decision: Set the local runner to `SCRIPT_PROVIDER=reddit`. It discovers public candidates from a configurable rotation of high-school memories, romance, embarrassing situations, bullying, family stories, scary encounters, money problems, Tinder dates, failed pranks, divorce, betrayal and harmless revenge, filters obvious safety/privacy problems and previously used posts, then asks Gemini to produce an original English adaptation with changed names and identifying details.
- Reason: The editorial format should be grounded in real audience stories while avoiding verbatim readings, username exposure and a pipeline that silently treats a public Reddit post as a free commercial license.
- Alternatives considered: Continue inventing every story with Gemini, read Reddit posts verbatim, or use untracked browser scraping. The first loses the source-driven format; the other two create avoidable originality, privacy, traceability and terms-of-use risk.
- Consequences: Each run stores a minimal `reddit-source.json`, records the permalink and collection metadata in `.data/local-pipeline/reddit-usage.jsonl`, and remains blocked from automatic publication until a human verifies rights, safety and editorial originality. `SCRIPT_PROVIDER=gemini` remains available for invented stories.

## 2026-10-18 — Gemini as the default local source provider

- Decision: Keep `SCRIPT_PROVIDER=gemini` as the normal local configuration. Reddit discovery is opt-in through `SCRIPT_PROVIDER=reddit` only.
- Reason: The operator can generate videos immediately without Reddit authentication, while the Reddit adapter remains available once API and commercial-use permissions are resolved.
- Consequences: `npm run generate` creates an original themed story and does not call Reddit. Reddit-specific source tracking is used only when the Reddit provider is explicitly enabled.

## 2026-10-18 — Separate narration profiles

- Decision: Keep `male` and `female` as explicit local narration profiles. `male` points to the original George voice used for the first video; `female` points to the Sarah voice selected for female-perspective stories.
- Reason: The editorial perspective should be selectable per story without manually rewriting `.env` or changing the rendering code.
- Consequences: The runner defaults to `--perspective auto`, asks Gemini to classify the story perspective, accepts `male|female` as explicit overrides, records only the resolved perspective label in the manifest, and keeps the ElevenLabs API key local-only.

## 2026-10-18 — Updated ElevenLabs narration pool

- Decision: Use Laura (`FGY2WhTYpPnrIDTdsKH5`) for female-perspective stories. Use a random male voice per run from Liam (`TX3LPaxmHKxFdv7VOQHJ`), Brian (`nPczCjzI2devNBz1zQrb`) and Adam (`pNInz6obpgDQGcFmaJgB`).
- Reason: The new Starter plan provides a coherent set of social-media voices and rotating the male profile avoids every video sounding identical.
- Consequences: The selected voice ID is recorded in each local manifest for traceability; API secrets remain only in `.env`.

### Docker runtime verification on macOS

The Compose stack was verified with Docker running under Colima on macOS ARM after pinning the application image to Node `22.20.0-alpine`. Node 20 was rejected because pnpm 11 failed during the image install with a dynamic-import runtime error. Redis readiness probes are idempotent and BullMQ job IDs are SHA-256 derived because BullMQ rejects colon-containing custom IDs used by the pipeline's readable idempotency keys.

## 2026-10-20 — Reddit proposal inbox and daily editorial selection

- Decision: Add a dashboard/API inbox that fetches exactly ten filtered Reddit candidates, shows their source excerpt and permalink, and requires the operator to select exactly five candidates for the current date. Each selected story receives a Europe/Rome or US/Eastern publishing window before five idempotent generation jobs are enqueued.
- Reason: Separating discovery from production gives the operator control over story quality, safety, originality and daily volume while preserving traceability to the source.
- Alternatives considered: Generate directly from the first Reddit result, scrape Reddit through a browser, or let the pipeline publish every discovered post. These were rejected because they reduce editorial control, are fragile or can conflict with provider terms and rights requirements.
- Consequences: Reddit OAuth credentials are runtime-only; public-feed access is a best-effort fallback and may return HTTP 403. Selection and schedule are stored in candidate metadata with the date; the downstream `reddit-generation` worker remains the explicit integration point for real rendering, approval and publishing.
