# Database

Phase 2 uses Drizzle ORM with PostgreSQL. The schema is in `packages/database/src/schema.ts`; the versioned migration is in `packages/database/drizzle/0000_core_domain.sql`. `pnpm --filter @shortfactory/database db:migrate` creates the migration ledger and applies the migration, while `db:seed` inserts the three channels, five sources and demo candidate idempotently.

The API uses `MemoryDomainStore` for local development and `PostgresDomainStore` when `DATABASE_MODE=postgres`. Domain repositories remain behind the `DomainStore` interface so the HTTP layer does not access database tables directly.
