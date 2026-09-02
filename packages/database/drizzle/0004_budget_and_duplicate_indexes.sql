ALTER TABLE "budgets" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS "source_assets_source_url_unique" ON "source_assets" ("source_url");
