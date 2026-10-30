import { defineConfig } from "drizzle-kit";

/**
 * Optional: push the schema to a remote database (e.g. Neon) manually:
 *   DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" npx drizzle-kit push --config drizzle.config.prod.ts
 * (Not required — the app provisions its tables automatically on first request, see src/db/ensure-schema.ts)
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
});
