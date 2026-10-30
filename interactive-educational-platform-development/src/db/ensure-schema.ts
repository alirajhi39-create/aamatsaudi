import { dbTarget, pool } from "@/db";
import { normalizeNameKey } from "@/lib/normalize";

/**
 * Self-provisioning schema.
 *
 * Production databases (Neon on Vercel) are often created without running `drizzle-kit push`.
 * Instead of failing with "relation does not exist", every API route calls `ensureSchema()` which
 * creates the tables / columns / indexes idempotently (once per server instance). The DDL mirrors
 * `src/db/schema.ts` exactly, so a later `drizzle-kit push` reports no changes.
 */

export type SchemaStatus = {
  ok: boolean;
  checkedAt: string;
  provisioned: boolean;
  tables: Record<string, boolean>;
  columnsAdded: string[];
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

const REQUIRED: Record<string, string[]> = {
  lesson_progress: ["id", "student_id", "name", "name_key", "class_name", "class_raw", "current_slide", "max_slide", "quiz_score", "quiz_total", "quiz_attempts", "activities", "completed", "last_seen_at", "created_at", "updated_at"],
  teacher_names: ["id", "student_id", "name", "name_key", "class_name", "locked", "created_at", "updated_at"],
  lesson_sounds: ["id", "key", "file_name", "mime_type", "size_bytes", "etag", "data", "created_at", "updated_at"],
};

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
  // Upgrades for databases provisioned by an earlier version of the app
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "name_key" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "class_raw" text`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "quiz_attempts" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "completed" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "lesson_progress" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL`,
  `ALTER TABLE "teacher_names" ADD COLUMN IF NOT EXISTS "locked" boolean DEFAULT true NOT NULL`,
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

const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS "lesson_progress_class_idx" ON "lesson_progress" USING btree ("class_name")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "lesson_progress_class_namekey_idx" ON "lesson_progress" USING btree ("class_name","name_key") WHERE "lesson_progress"."name_key" <> ''`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "teacher_names_class_namekey_idx" ON "teacher_names" USING btree ("class_name","name_key")`,
];

const LOCK_KEY = 727_327_006; // arbitrary constant for pg_advisory_lock

const g = globalThis as typeof globalThis & { __ssa2Schema?: Promise<SchemaStatus> };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Inspect information_schema and return which required tables/columns are missing. */
export async function inspectSchema(): Promise<{ tables: Record<string, boolean>; missingColumns: string[] }> {
  const res = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [Object.keys(REQUIRED)],
  );
  const have = new Map<string, Set<string>>();
  for (const r of res.rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name)!.add(r.column_name);
  }
  const tables: Record<string, boolean> = {};
  const missingColumns: string[] = [];
  for (const [t, cols] of Object.entries(REQUIRED)) {
    tables[t] = have.has(t);
    if (have.has(t)) for (const c of cols) if (!have.get(t)!.has(c)) missingColumns.push(`${t}.${c}`);
  }
  return { tables, missingColumns };
}

async function provision(): Promise<SchemaStatus> {
  const warnings: string[] = [];
  const columnsAdded: string[] = [];
  const before = await inspectSchema();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      for (const stmt of DDL) {
        try {
          await client.query(stmt);
        } catch (e) {
          warnings.push(`${stmt.slice(0, 60).replace(/\s+/g, " ")}… → ${errMsg(e)}`);
        }
      }
      // Backfill name_key for rows created by an older version (JS normalisation = exact match with the app)
      let backfilled = 0;
      try {
        const rows = await client.query<{ id: number; name: string }>(`SELECT id, name FROM "lesson_progress" WHERE "name_key" = ''`);
        for (const r of rows.rows) {
          try {
            await client.query(`UPDATE "lesson_progress" SET "name_key" = $1 WHERE "id" = $2`, [normalizeNameKey(r.name), r.id]);
            backfilled++;
          } catch (e) {
            warnings.push(`backfill #${r.id}: ${errMsg(e)}`);
          }
        }
      } catch (e) {
        warnings.push(`backfill: ${errMsg(e)}`);
      }
      for (const stmt of INDEXES) {
        try {
          await client.query(stmt);
        } catch (e) {
          warnings.push(`${stmt.slice(0, 60).replace(/\s+/g, " ")}… → ${errMsg(e)}`);
        }
      }
      const after = await inspectSchema();
      for (const c of before.missingColumns) if (!after.missingColumns.includes(c)) columnsAdded.push(c);
      const ok = Object.values(after.tables).every(Boolean) && after.missingColumns.length === 0;
      if (!ok) {
        const missing = [...Object.entries(after.tables).filter(([, v]) => !v).map(([k]) => k), ...after.missingColumns];
        throw new Error(`تعذر إنشاء جداول قاعدة البيانات (${missing.join(", ")}). ${warnings.join(" | ")}`);
      }
      return { ok, checkedAt: new Date().toISOString(), provisioned: true, tables: after.tables, columnsAdded, backfilled, warnings };
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

async function run(): Promise<SchemaStatus> {
  if (!dbTarget.configured) {
    throw new DbConfigError("لم يتم ضبط رابط قاعدة البيانات (DATABASE_URL) في إعدادات الاستضافة.");
  }
  const { tables, missingColumns } = await inspectSchema();
  if (Object.values(tables).every(Boolean) && missingColumns.length === 0) {
    return { ok: true, checkedAt: new Date().toISOString(), provisioned: false, tables, columnsAdded: [], backfilled: 0, warnings: [] };
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
