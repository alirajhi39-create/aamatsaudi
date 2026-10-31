import { dbTarget, pool, setSchemaRepairHandler } from "@/db";
import { normalizeNameKey } from "@/lib/normalize";

/**
 * Self-provisioning schema.
 *
 * Production databases (Neon on Vercel) are often created without running `drizzle-kit push`.
 * Instead of failing with "relation does not exist", every API route calls `ensureSchema()` which
 * creates the tables / columns / unique constraints / indexes idempotently (once per server
 * instance). The DDL mirrors `src/db/schema.ts` exactly, so a later `drizzle-kit push` is a no-op.
 *
 * Pooler-safe: all DDL runs inside ONE transaction guarded by `pg_advisory_xact_lock`, so it works
 * through Neon's PgBouncer (transaction pooling) where session-level locks would leak.
 */

export type SchemaStatus = {
  ok: boolean;
  checkedAt: string;
  provisioned: boolean;
  tables: Record<string, boolean>;
  columnsAdded: string[];
  indexesAdded: string[];
  missingCritical: string[];
  missingOptional: string[];
  backfilled: number;
  warnings: string[];
};

export class DbConfigError extends Error {
  code = "DB_NOT_CONFIGURED";
  constructor(message: string) {
    super(message);
    this.name = "DbConfigError";
  }
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  lesson_progress: ["id", "student_id", "name", "name_key", "class_name", "class_raw", "current_slide", "max_slide", "quiz_score", "quiz_total", "quiz_attempts", "activities", "completed", "last_seen_at", "created_at", "updated_at"],
  teacher_names: ["id", "student_id", "name", "name_key", "class_name", "locked", "created_at", "updated_at"],
  lesson_sounds: ["id", "key", "file_name", "mime_type", "size_bytes", "etag", "data", "created_at", "updated_at"],
};

type IndexSpec = { id: string; table: string; columns: string[]; unique: boolean; partial: boolean; critical: boolean };
/** Critical = required by `ON CONFLICT (...)` upserts; optional = performance / duplicate protection. */
const REQUIRED_INDEXES: IndexSpec[] = [
  { id: "lesson_progress(student_id) UNIQUE", table: "lesson_progress", columns: ["student_id"], unique: true, partial: false, critical: true },
  { id: "teacher_names(student_id) UNIQUE", table: "teacher_names", columns: ["student_id"], unique: true, partial: false, critical: true },
  { id: "lesson_sounds(key) UNIQUE", table: "lesson_sounds", columns: ["key"], unique: true, partial: false, critical: true },
  { id: "lesson_progress(class_name,name_key) UNIQUE partial", table: "lesson_progress", columns: ["class_name", "name_key"], unique: true, partial: true, critical: false },
  { id: "teacher_names(class_name,name_key) UNIQUE", table: "teacher_names", columns: ["class_name", "name_key"], unique: true, partial: false, critical: false },
  { id: "lesson_progress(class_name)", table: "lesson_progress", columns: ["class_name"], unique: false, partial: false, critical: false },
];

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS "lesson_progress" (
    "id" serial PRIMARY KEY NOT NULL,
    "student_id" text NOT NULL,
    "name" text NOT NULL,
    "name_key" text DEFAULT '' NOT NULL,
    "class_name" text NOT NULL,
    "class_raw" text,
    "current_slide" integer DEFAULT 0 NOT NULL,
    "max_slide" integer DEFAULT 0 NOT NULL,
    "quiz_score" integer,
    "quiz_total" integer,
    "quiz_attempts" integer DEFAULT 0 NOT NULL,
    "activities" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "lesson_progress_student_id_unique" UNIQUE("student_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "teacher_names" (
    "id" serial PRIMARY KEY NOT NULL,
    "student_id" text NOT NULL,
    "name" text NOT NULL,
    "name_key" text NOT NULL,
    "class_name" text NOT NULL,
    "locked" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "teacher_names_student_id_unique" UNIQUE("student_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "lesson_sounds" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" text NOT NULL,
    "file_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "size_bytes" integer NOT NULL,
    "etag" text NOT NULL,
    "data" bytea NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "lesson_sounds_key_unique" UNIQUE("key")
  )`,
  // Upgrades for databases provisioned by an earlier version of the app (or created by hand)
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "name_key" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "class_raw" text`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "current_slide" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "max_slide" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_score" integer`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_total" integer`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_attempts" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "activities" jsonb DEFAULT '{}'::jsonb NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `ALTER TABLE "teacher_names" ADD COLUMN IF NOT EXISTS "name_key" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "teacher_names" ADD COLUMN IF NOT EXISTS "locked" boolean DEFAULT true NOT NULL`,
  `ALTER TABLE "teacher_names" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `ALTER TABLE "teacher_names" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL`,
  // Align auto-named unique constraints (from hand-made tables) with Drizzle's names so `drizzle-kit push` stays a no-op
  `DO $$ BEGIN
     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_student_id_key') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_student_id_unique') THEN
       ALTER TABLE "lesson_progress" RENAME CONSTRAINT "lesson_progress_student_id_key" TO "lesson_progress_student_id_unique";
     END IF;
     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_names_student_id_key') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teacher_names_student_id_unique') THEN
       ALTER TABLE "teacher_names" RENAME CONSTRAINT "teacher_names_student_id_key" TO "teacher_names_student_id_unique";
     END IF;
     IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_sounds_key_key') AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lesson_sounds_key_unique') THEN
       ALTER TABLE "lesson_sounds" RENAME CONSTRAINT "lesson_sounds_key_key" TO "lesson_sounds_key_unique";
     END IF;
   END $$`,
];

/** A unique, non-partial index on a single column (any name) satisfies `ON CONFLICT (column)`. */
function uniqueConstraintDDL(table: string, column: string, constraint: string) {
  return `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = current_schema() AND t.relname = '${table}' AND i.indisunique AND i.indpred IS NULL
        AND i.indnatts = 1
        AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = i.indkey[0]) = '${column}'
    ) THEN
      ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" UNIQUE ("${column}");
    END IF;
  END $$`;
}

const INDEX_DDL: string[] = [
  uniqueConstraintDDL("lesson_progress", "student_id", "lesson_progress_student_id_unique"),
  uniqueConstraintDDL("teacher_names", "student_id", "teacher_names_student_id_unique"),
  uniqueConstraintDDL("lesson_sounds", "key", "lesson_sounds_key_unique"),
  `CREATE INDEX IF NOT EXISTS "lesson_progress_class_idx" ON "lesson_progress" USING btree ("class_name")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_progress_class_namekey_idx" ON "lesson_progress" USING btree ("class_name","name_key") WHERE "lesson_progress"."name_key" <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "teacher_names_class_namekey_idx" ON "teacher_names" USING btree ("class_name","name_key")`,
];

const LOCK_KEY = 727_327_006; // arbitrary constant for pg_advisory_xact_lock

const g = globalThis as typeof globalThis & { __ssa2Schema?: Promise<SchemaStatus> };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export type SchemaInspection = {
  tables: Record<string, boolean>;
  missingColumns: string[];
  missingCritical: string[];
  missingOptional: string[];
  indexes: Array<{ table: string; name: string; unique: boolean; partial: boolean; columns: string[] }>;
};

/** Inspect information_schema / pg_index and return what is missing. */
export async function inspectSchema(): Promise<SchemaInspection> {
  const tableNames = Object.keys(REQUIRED_COLUMNS);
  const cols = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tableNames],
  );
  const have = new Map<string, Set<string>>();
  for (const r of cols.rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name)!.add(r.column_name);
  }
  const tables: Record<string, boolean> = {};
  const missingColumns: string[] = [];
  for (const [t, required] of Object.entries(REQUIRED_COLUMNS)) {
    tables[t] = have.has(t);
    if (have.has(t)) for (const c of required) if (!have.get(t)!.has(c)) missingColumns.push(`${t}.${c}`);
  }

  const idx = await pool.query<{ table_name: string; index_name: string; is_unique: boolean; is_partial: boolean; columns: string[] }>(
    `SELECT t.relname::text AS table_name, c.relname::text AS index_name, i.indisunique AS is_unique, (i.indpred IS NOT NULL) AS is_partial,
            array_agg(a.attname::text ORDER BY k.ord)::text[] AS columns
     FROM pg_index i
     JOIN pg_class t ON t.oid = i.indrelid
     JOIN pg_class c ON c.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
     WHERE n.nspname = current_schema() AND t.relname = ANY($1::text[])
     GROUP BY t.relname, c.relname, i.indisunique, i.indpred`,
    [tableNames],
  );
  const toArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.replace(/^\{|\}$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).filter(Boolean) : [];
  const indexes = idx.rows.map((r) => ({ table: r.table_name, name: r.index_name, unique: r.is_unique, partial: r.is_partial, columns: toArray(r.columns) }));
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];
  for (const spec of REQUIRED_INDEXES) {
    if (!tables[spec.table]) continue; // reported as a missing table instead
    const found = indexes.some(
      (ix) =>
        ix.table === spec.table &&
        ix.columns.length === spec.columns.length &&
        spec.columns.every((c, i) => ix.columns[i] === c) &&
        (!spec.unique || ix.unique) &&
        (spec.partial ? true : !ix.partial),
    );
    if (!found) (spec.critical ? missingCritical : missingOptional).push(spec.id);
  }
  return { tables, missingColumns, missingCritical, missingOptional, indexes };
}

function isComplete(i: SchemaInspection) {
  return Object.values(i.tables).every(Boolean) && i.missingColumns.length === 0 && i.missingCritical.length === 0 && i.missingOptional.length === 0;
}

async function provision(): Promise<SchemaStatus> {
  const warnings: string[] = [];
  const before = await inspectSchema();
  const client = await pool.connect();
  let backfilled = 0;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);

    const exec = async (label: string, stmt: string, params?: unknown[]) => {
      await client.query("SAVEPOINT ddl");
      try {
        await client.query(stmt, params);
        await client.query("RELEASE SAVEPOINT ddl");
        return true;
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT ddl");
        warnings.push(`${label}: ${errMsg(e)}`);
        return false;
      }
    };

    for (const stmt of DDL) await exec(stmt.slice(0, 70).replace(/\s+/g, " ") + "…", stmt);

    // Backfill name_key for rows created by an older version (JS normalisation = exact match with the app)
    try {
      const rows = await client.query<{ id: number; name: string }>(`SELECT id, name FROM "lesson_progress" WHERE "name_key" = ''`);
      for (const r of rows.rows) {
        if (await exec(`backfill #${r.id}`, `UPDATE "lesson_progress" SET "name_key" = $1 WHERE "id" = $2`, [normalizeNameKey(r.name), r.id])) backfilled++;
      }
    } catch (e) {
      warnings.push(`backfill: ${errMsg(e)}`);
    }

    for (const stmt of INDEX_DDL) await exec(stmt.slice(0, 70).replace(/\s+/g, " ") + "…", stmt);

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const after = await inspectSchema();
  const columnsAdded = before.missingColumns.filter((c) => !after.missingColumns.includes(c));
  const indexesAdded = [...before.missingCritical, ...before.missingOptional].filter((x) => !after.missingCritical.includes(x) && !after.missingOptional.includes(x));
  const ok = Object.values(after.tables).every(Boolean) && after.missingColumns.length === 0 && after.missingCritical.length === 0;
  if (!ok) {
    const missing = [...Object.entries(after.tables).filter(([, v]) => !v).map(([k]) => `جدول ${k}`), ...after.missingColumns.map((c) => `عمود ${c}`), ...after.missingCritical.map((c) => `قيد ${c}`)];
    throw new Error(`تعذر إكمال مخطط قاعدة البيانات (${missing.join("، ")}). ${warnings.join(" | ")}`);
  }
  return {
    ok,
    checkedAt: new Date().toISOString(),
    provisioned: true,
    tables: after.tables,
    columnsAdded,
    indexesAdded,
    missingCritical: after.missingCritical,
    missingOptional: after.missingOptional,
    backfilled,
    warnings,
  };
}

async function run(): Promise<SchemaStatus> {
  if (!dbTarget.configured) {
    throw new DbConfigError("لم يتم ضبط رابط قاعدة البيانات (DATABASE_URL) في إعدادات الاستضافة.");
  }
  const inspection = await inspectSchema();
  if (isComplete(inspection)) {
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      provisioned: false,
      tables: inspection.tables,
      columnsAdded: [],
      indexesAdded: [],
      missingCritical: [],
      missingOptional: [],
      backfilled: 0,
      warnings: [],
    };
  }
  return provision();
}

/**
 * Make sure the schema exists. Memoised per server instance; pass `force` to re-check/provision.
 * Throws on DB connectivity problems (handled by `dbError()` in the API layer).
 */
export function ensureSchema(force = false): Promise<SchemaStatus> {
  if (!force && g.__ssa2Schema) return g.__ssa2Schema;
  const p = run().catch((e) => {
    g.__ssa2Schema = undefined; // allow the next request to try again
    throw e;
  });
  g.__ssa2Schema = p;
  return p;
}

/** Forget the memoised status (used after "relation does not exist" errors). */
export function resetSchemaMemo() {
  g.__ssa2Schema = undefined;
}

// Let the connection layer self-heal: on 42P01 / 42703 / 42P10 re-provision once, then retry the query.
setSchemaRepairHandler(() => {
  resetSchemaMemo();
  return ensureSchema(true);
});
