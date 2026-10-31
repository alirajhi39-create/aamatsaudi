import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { isSchemaError, isTransientDbError } from "./transient";

/**
 * Database connection (PostgreSQL via node-postgres).
 *
 * - Accepts DATABASE_URL plus the variable names used by the Vercel ↔ Neon integration.
 * - Enables TLS automatically for any non-local host (Neon requires SSL).
 * - Uses a small pool suited to serverless functions.
 * - Never throws at import time: a missing URL becomes a friendly API error instead of a crash.
 * - `pool.query` is wrapped with an automatic retry: when a pooled connection died while the
 *   serverless instance was frozen (or Neon auto-suspended), the statement is transparently
 *   re-sent on a fresh connection. Schema errors trigger the self-provisioning once, then retry.
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
    idleTimeoutMillis: serverless ? 5_000 : 30_000,
    connectionTimeoutMillis: 15_000,
    query_timeout: 20_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    allowExitOnIdle: true,
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

/* ----------------------------- retry wrapper ----------------------------- */

const RETRY_DELAYS_MS = [120, 350, 800, 1500];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type QueryFn = (...args: unknown[]) => unknown;
type RepairFn = () => Promise<unknown>;

const retryState = globalThis as typeof globalThis & {
  __ssa2Repair?: RepairFn | null;
  __ssa2Repairing?: Promise<unknown> | null;
  __ssa2RetryStats?: { retries: number; repairs: number; lastError: string | null; lastErrorAt: string | null };
};
retryState.__ssa2RetryStats ??= { retries: 0, repairs: 0, lastError: null, lastErrorAt: null };

/** Registered by `src/db/ensure-schema.ts`; re-provisions the schema when a query hits 42P01/42703/42P10. */
export function setSchemaRepairHandler(fn: RepairFn) {
  retryState.__ssa2Repair = fn;
}
export function getRetryStats() {
  return { ...retryState.__ssa2RetryStats! };
}

/** Run a DB operation with the same transient-error / schema-repair retry policy as `pool.query`. */
export async function withDbRetry<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRetry(fn);
}

async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  let repaired = false;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const stats = retryState.__ssa2RetryStats!;
      if (isSchemaError(e) && retryState.__ssa2Repair && !repaired) {
        repaired = true;
        try {
          if (!retryState.__ssa2Repairing) {
            retryState.__ssa2Repairing = retryState.__ssa2Repair().finally(() => {
              retryState.__ssa2Repairing = null;
            });
          }
          await Promise.race([retryState.__ssa2Repairing, sleep(15_000)]);
          stats.repairs++;
        } catch {
          throw e;
        }
        continue;
      }
      if (isTransientDbError(e) && attempt < RETRY_DELAYS_MS.length) {
        stats.retries++;
        stats.lastError = e instanceof Error ? e.message : String(e);
        stats.lastErrorAt = new Date().toISOString();
        await sleep(RETRY_DELAYS_MS[attempt++]);
        continue;
      }
      throw e;
    }
  }
}

function installQueryRetry(p: Pool) {
  const original = (p.query as unknown as QueryFn).bind(p);
  const wrapped: QueryFn = (...args) => {
    // Callback style is passed through untouched; Drizzle always uses the promise form.
    if (typeof args[args.length - 1] === "function") return original(...args);
    return runWithRetry(() => original(...args) as Promise<unknown>);
  };
  (p as unknown as { query: QueryFn }).query = wrapped;
}

/* -------------------------------- singleton ------------------------------- */

const globalForDb = globalThis as typeof globalThis & {
  __ssa2Pool?: Pool;
  __ssa2Target?: DbTarget;
};

if (!globalForDb.__ssa2Pool) {
  const { config, target } = build();
  const p = new Pool(config);
  // Prevent an idle-client error (e.g. Neon closing a sleeping connection) from crashing the process.
  p.on("error", () => {});
  installQueryRetry(p);
  globalForDb.__ssa2Pool = p;
  globalForDb.__ssa2Target = target;
}

export const pool: Pool = globalForDb.__ssa2Pool;
export const dbTarget: DbTarget = globalForDb.__ssa2Target!;
export const db = drizzle(pool);

export function poolStats() {
  return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max ?? null };
}
