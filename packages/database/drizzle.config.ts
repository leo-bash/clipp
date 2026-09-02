import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgresql://shortfactory:shortfactory@localhost:5432/shortfactory" },
  strict: true,
  verbose: true
});
