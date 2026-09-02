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
