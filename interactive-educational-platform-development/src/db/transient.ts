/**
 * Error classification shared by the connection layer and the API error translator.
 * Kept dependency-free so `src/db/index.ts` can import it without cycles.
 */
export type AnyErr = { code?: string; message?: string; cause?: AnyErr; errors?: AnyErr[]; name?: string; stack?: string };

/** Unwrap Drizzle's DrizzleQueryError ("Failed query: …") and AggregateErrors to the root cause. */
export function rootCause(e: unknown): AnyErr {
  let cur = (e ?? {}) as AnyErr;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.cause && typeof cur.cause === "object") cur = cur.cause;
    else if (Array.isArray(cur.errors) && cur.errors[0]) cur = cur.errors[0];
    else break;
  }
  return cur ?? {};
}

export function errorCode(e: unknown): string {
  const root = rootCause(e);
  return String(root.code ?? (e as AnyErr)?.code ?? "");
}

export function errorMessage(e: unknown): string {
  const root = rootCause(e);
  return String(root.message ?? (e as AnyErr)?.message ?? "");
}

/**
 * Errors that are worth retrying with a fresh connection:
 *  - the pooled client died while the serverless instance was frozen / Neon compute auto-suspended
 *  - the database is waking up or briefly unavailable
 */
const TRANSIENT_CODES = new Set([
  // PostgreSQL class 08 — connection exception
  "08000", "08001", "08003", "08004", "08006", "08007",
  // class 57 — operator intervention (admin shutdown, crash, idle-session timeout, cannot connect now)
  "57P01", "57P02", "57P03", "57P05",
  // too many connections / out of resources (back-off and retry)
  "53300", "53200",
  // Neon proxy / internal transient errors
  "XX000",
  // Node.js socket errors
  "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "ECONNABORTED",
]);

const TRANSIENT_PATTERNS: RegExp[] = [
  /connection terminated/i,
  /not queryable/i,
  /connection error/i,
  /server closed the connection/i,
  /socket hang up/i,
  /terminating connection/i,
  /connection ended/i,
  /timeout exceeded when trying to connect/i,
  /query read timeout/i,
  /ssl connection has been closed unexpectedly/i,
  /database system is (starting up|shutting down)/i,
  /couldn't connect to compute/i,
  /endpoint is in transition/i,
  /compute (node|endpoint).*(suspend|unavailable|not available)/i,
  /too many connections/i,
  /remaining connection slots/i,
  /write EPIPE|read ECONNRESET/i,
];

export function isTransientDbError(e: unknown): boolean {
  const code = errorCode(e);
  if (code && TRANSIENT_CODES.has(code)) return true;
  const msg = errorMessage(e);
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}

/** Errors that mean the schema is missing/outdated and can be fixed by re-running the provisioning. */
export const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "42P10"]);
export function isSchemaError(e: unknown): boolean {
  return SCHEMA_ERROR_CODES.has(errorCode(e));
}
