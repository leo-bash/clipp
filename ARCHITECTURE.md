# ShortFactory — Architecture

## Phase 1 scope

ShortFactory is a TypeScript monorepo designed for a single VPS first and horizontal worker scaling later. Phase 1 establishes process boundaries, configuration, structured logging, persistence/queue interfaces, and health checks. Domain models and CRUD are intentionally deferred to Phase 2.

## Runtime topology

```text
Browser → nginx (optional) → dashboard (Next.js)
                         └→ api (Fastify)
                               ├→ database adapter → PostgreSQL
                               └→ queue adapter    → Redis/BullMQ

worker-light / worker-render → queue adapter → Redis/BullMQ
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
- `packages/shared`: cross-package types and error taxonomy.
- `infrastructure`: Docker Compose and future deployment scripts.

## Design constraints

Provider integrations use interfaces/adapters. Paid providers must be gated by cost control before execution. Rights and publication safety gates belong in domain/application packages in later phases. Secrets are runtime configuration only and are never logged or committed.

## Local modes

`DATABASE_MODE=memory` and `QUEUE_MODE=mock` make the service shell runnable without Docker. They are explicit development adapters, not production fallbacks. Docker Compose sets PostgreSQL and Redis modes and readiness checks those real dependencies.
