import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

/**
 * Database connection (PostgreSQL via node-postgres).
 *
 * - Accepts DATABASE_URL plus the variable names used by the Vercel ↔ Neon integration.
 * - Enables TLS automatically for any non-local host (Neon requires SSL).
 * - Uses a small pool suited to serverless functions.
 * - Never throws at import time: a missing URL becomes a friendly API error instead of a crash.
 */
const CANDIDATE_ENV_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "NEON_DATABASE_URL",
] as const;

const LOCAL_HOSTS = new Set(["", "localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"]);
const PLACEHOLDER_URL = "postgresql://postgres:postgres@127.0.0.1:5432/missing_database_url";

export type DbTarget = {
  configured: boolean;
  source: string | null;
  host: string | null;
  port: string | null;
  database: string | null;
  isLocal: boolean;
  ssl: "off" | "require" | "verify";
  serverless: boolean;
  pooler: boolean;
};

function resolveUrl(): { url: string | null; source: string | null } {
  for (const key of CANDIDATE_ENV_VARS) {
    const v = process.env[key]?.trim();
    if (v) return { url: v, source: key };
  }
  return { url: null, source: null };
}

const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.FUNCTIONS_WORKER_RUNTIME);

function build(): { config: PoolConfig; target: DbTarget } {
  const { url: raw, source } = resolveUrl();
  const target: DbTarget = {
    configured: Boolean(raw),
    source,
    host: null,
    port: null,
    database: null,
    isLocal: true,
    ssl: "off",
    serverless,
    pooler: false,
  };
  const config: PoolConfig = {
    max: serverless ? 3 : 10,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  };
  if (!raw) {
    config.connectionString = PLACEHOLDER_URL;
    return { config, target };
  }

  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  const host = url?.hostname ?? "";
  const isLocal = LOCAL_HOSTS.has(host) || host.endsWith(".local");
  const sslmode = url?.searchParams.get("sslmode") ?? null;
  target.host = host || null;
  target.port = url?.port || "5432";
  target.database = url ? url.pathname.replace(/^\//, "") || null : null;
  target.isLocal = isLocal;
  target.pooler = host.includes("-pooler");

  if (url && !isLocal && sslmode !== "disable") {
    // Strip sslmode/channel_binding so the explicit ssl config below is not overridden by the parsed URL.
    const strict = sslmode === "verify-full" || sslmode === "verify-ca";
    url.searchParams.delete("sslmode");
    url.searchParams.delete("channel_binding");
    config.connectionString = url.toString();
    config.ssl = strict ? { rejectUnauthorized: true } : { rejectUnauthorized: false };
    target.ssl = strict ? "verify" : "require";
  } else {
    config.connectionString = raw;
  }
  return { config, target };
}

const globalForDb = globalThis as typeof globalThis & {
  __ssa2Pool?: Pool;
  __ssa2Target?: DbTarget;
};

if (!globalForDb.__ssa2Pool) {
  const { config, target } = build();
  globalForDb.__ssa2Pool = new Pool(config);
  globalForDb.__ssa2Target = target;
  // Prevent an idle-client error (e.g. Neon closing a sleeping connection) from crashing the process.
  globalForDb.__ssa2Pool.on("error", () => {});
}

export const pool: Pool = globalForDb.__ssa2Pool;
export const dbTarget: DbTarget = globalForDb.__ssa2Target!;
export const db = drizzle(pool);
