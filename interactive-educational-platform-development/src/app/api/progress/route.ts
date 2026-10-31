import { NextRequest } from "next/server";
import { TransactionRollbackError, asc, eq, sql } from "drizzle-orm";
import { db, dbTarget, getRetryStats, poolStats } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { lessonProgress, lessonSounds, teacherNames } from "@/db/schema";
import { corsHeaders, error, json, preflight } from "@/lib/cors";
import { isTeacherAuthorized } from "@/lib/teacher-auth";
import { dbError, describeDbError, prepareDb } from "@/lib/db-errors";
import { cleanDisplayName, normalizeClassName, normalizeNameKey } from "@/lib/normalize";
import {
  LESSON_ID,
  TOTAL_SLIDES,
  getProgress,
  isUniqueViolation,
  saveProgress,
  serializeProgress,
} from "@/lib/progress-service";
import { MAX_SOUND_BYTES } from "@/lib/sound-keys";
import { FIXED_CLASS } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

/* -------------------------------------------------------------------------- */
/*                               Diagnostics                                  */
/* -------------------------------------------------------------------------- */

async function runDiagnostics(req: NextRequest) {
  const started = Date.now();
  const problems: string[] = [];

  const report: Record<string, unknown> = {
    ok: true,
    mode: "diagnose",
    lesson: LESSON_ID,
    totalSlides: TOTAL_SLIDES,
    timestamp: new Date().toISOString(),
    runtime: {
      node: process.version,
      nodeEnv: process.env.NODE_ENV ?? null,
      vercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION ?? null,
      serverless: Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME),
    },
    security: {
      teacherPinSource: process.env.TEACHER_PIN_OVERRIDE ? "env-override" : "code",
    },
    limits: { maxSoundBytes: MAX_SOUND_BYTES, maxSoundMb: MAX_SOUND_BYTES / (1024 * 1024) },
    cors: corsHeaders(req.headers.get("origin")),
  };

  const database: Record<string, unknown> = {
    configured: dbTarget.configured,
    source: dbTarget.source,
    host: dbTarget.host,
    port: dbTarget.port,
    name: dbTarget.database,
    ssl: dbTarget.ssl,
    pooler: dbTarget.pooler,
    isLocalHost: dbTarget.isLocal,
    connected: false,
  };
  if (!dbTarget.configured) problems.push("لم يتم ضبط DATABASE_URL على الخادم.");
  else if (dbTarget.isLocal && dbTarget.serverless) problems.push("DATABASE_URL يشير إلى 127.0.0.1 — غير صالح على Vercel؛ استخدم رابط Neon.");
  try {
    const t0 = Date.now();
    const v = await db.execute(sql`select version() as version, now() as now, current_database() as db`);
    const first = (v.rows?.[0] ?? {}) as Record<string, unknown>;
    database.connected = true;
    database.latencyMs = Date.now() - t0;
    database.version = first.version ?? null;
    database.serverTime = first.now ?? null;
    database.name = first.db ?? null;
  } catch (e) {
    report.ok = false;
    const info = describeDbError(e);
    database.error = info.message;
    database.errorDetail = info.detail;
    if (info.hint) database.hint = info.hint;
    problems.push(`${info.message} ${info.hint ?? ""}`.trim());
  }
  report.database = database;

  // Schema (auto-provisioning + constraint verification)
  let schemaOk = false;
  if (database.connected) {
    try {
      const status = await ensureSchema(true);
      report.schema = status;
      schemaOk = status.ok;
      if (status.provisioned) problems.push("تم إنشاء/تحديث الجداول أو القيود تلقائياً أثناء هذا الفحص.");
      for (const m of status.missingOptional) problems.push(`تحذير: الفهرس ${m} غير موجود (ربما بسبب أسماء مكررة قديمة).`);
      for (const w of status.warnings) problems.push(`تحذير مخطط: ${w}`);
    } catch (e) {
      report.ok = false;
      const info = describeDbError(e);
      report.schema = { ok: false, error: info.message, detail: info.detail };
      problems.push(`${info.message} ${info.hint ?? ""}`.trim());
    }
  }

  // Write self-test: run the real student upsert twice inside a transaction, then roll it back.
  const writeTest: Record<string, unknown> = { ok: false, step: null };
  if (database.connected && schemaOk) {
    const sid = `diag_${Date.now().toString(36)}`;
    const t0 = Date.now();
    try {
      await db.transaction(async (tx) => {
        const upsert = () =>
          tx
            .insert(lessonProgress)
            .values({ studentId: sid, name: "فحص تلقائي", nameKey: "", className: FIXED_CLASS, currentSlide: 1, maxSlide: 1, activities: { diag: true }, lastSeenAt: new Date() })
            .onConflictDoUpdate({
              target: lessonProgress.studentId,
              set: {
                currentSlide: 2,
                maxSlide: sql`GREATEST(${lessonProgress.maxSlide}, ${2})`,
                quizAttempts: sql`${lessonProgress.quizAttempts} + 1`,
                activities: sql`COALESCE(${lessonProgress.activities}, '{}'::jsonb) || ${JSON.stringify({ diag2: true })}::jsonb`,
                completed: sql`${lessonProgress.completed} OR ${false}`,
                updatedAt: new Date(),
              },
            })
            .returning({ id: lessonProgress.id, maxSlide: lessonProgress.maxSlide });
        writeTest.step = "insert";
        await upsert();
        writeTest.step = "upsert (on conflict)";
        const [row] = await upsert();
        writeTest.step = "teacher_names insert";
        await tx.insert(teacherNames).values({ studentId: sid, name: "فحص تلقائي", nameKey: sid, className: FIXED_CLASS }).onConflictDoNothing();
        writeTest.step = "select";
        await tx.select({ id: lessonProgress.id }).from(lessonProgress).where(eq(lessonProgress.studentId, sid)).limit(1);
        writeTest.upsertedMaxSlide = row?.maxSlide ?? null;
        writeTest.step = "rollback";
        tx.rollback();
      });
    } catch (e) {
      if (e instanceof TransactionRollbackError) {
        writeTest.ok = true;
        writeTest.step = "done";
      } else {
        report.ok = false;
        const info = describeDbError(e);
        writeTest.error = info.message;
        writeTest.code = info.code;
        writeTest.detail = info.detail;
        if (info.hint) writeTest.hint = info.hint;
        problems.push(`فشل اختبار الكتابة عند خطوة «${writeTest.step}»: ${info.message} [${info.code}] ${info.hint ?? ""}`.trim());
      }
    }
    writeTest.latencyMs = Date.now() - t0;
  } else if (database.connected) {
    writeTest.skipped = "schema incomplete";
  }
  report.writeTest = writeTest;
  report.pool = { ...poolStats(), retry: getRetryStats() };

  const tables: Record<string, unknown> = {};
  if (database.connected) {
    const specs: Array<[string, () => Promise<Record<string, unknown>>]> = [
      [
        "lesson_progress",
        async () => {
          const [c] = await db
            .select({
              rows: sql<number>`count(*)::int`,
              classes: sql<number>`count(distinct ${lessonProgress.className})::int`,
              completed: sql<number>`count(*) filter (where ${lessonProgress.completed})::int`,
            })
            .from(lessonProgress);
          return c;
        },
      ],
      [
        "teacher_names",
        async () => {
          const [c] = await db
            .select({
              rows: sql<number>`count(*)::int`,
              classes: sql<number>`count(distinct ${teacherNames.className})::int`,
            })
            .from(teacherNames);
          return c;
        },
      ],
      [
        "lesson_sounds",
        async () => {
          const [c] = await db
            .select({
              rows: sql<number>`count(*)::int`,
              totalBytes: sql<number>`coalesce(sum(${lessonSounds.sizeBytes}),0)::bigint`,
            })
            .from(lessonSounds);
          return { ...c, totalBytes: Number(c.totalBytes) };
        },
      ],
    ];
    for (const [name, fn] of specs) {
      try {
        const reg = await db.execute(sql`select to_regclass(${"public." + name}) as reg`);
        const exists = Boolean((reg.rows?.[0] as { reg?: string | null } | undefined)?.reg);
        tables[name] = exists ? { exists: true, ...(await fn()) } : { exists: false };
        if (!exists) report.ok = false;
      } catch (e) {
        report.ok = false;
        tables[name] = { exists: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  report.tables = tables;
  report.problems = problems;
  report.summary = report.ok && problems.length === 0 ? "كل شيء يعمل بشكل سليم ✅" : problems[0] ?? "توجد مشكلة";
  report.durationMs = Date.now() - started;
  return json(report, { req, status: report.ok ? 200 : 503 });
}

/* -------------------------------------------------------------------------- */
/*                                   GET                                      */
/* -------------------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // Diagnostics must work even when the database is misconfigured.
  if (params.get("diagnose") === "true" || params.get("diagnose") === "1") {
    return runDiagnostics(req);
  }
  const notReady = await prepareDb(req);
  if (notReady) return notReady;

  try {
    const studentId = params.get("studentId")?.trim();
    if (studentId) {
      const row = await getProgress(studentId);
      if (!row) return json({ ok: true, found: false, progress: null }, { req });
      const registered = await db
        .select({ locked: teacherNames.locked })
        .from(teacherNames)
        .where(eq(teacherNames.studentId, studentId))
        .limit(1);
      return json(
        { ok: true, found: true, progress: serializeProgress(row), locked: Boolean(registered[0]?.locked) },
        { req },
      );
    }

    const cls = params.get("class") ?? params.get("className");
    const normalized = cls ? normalizeClassName(cls) : null;
    const rows = normalized
      ? await db
          .select()
          .from(lessonProgress)
          .where(eq(lessonProgress.className, normalized))
          .orderBy(asc(lessonProgress.className), asc(lessonProgress.name))
      : await db.select().from(lessonProgress).orderBy(asc(lessonProgress.className), asc(lessonProgress.name));

    const lockedRows = await db.select({ studentId: teacherNames.studentId, locked: teacherNames.locked }).from(teacherNames);
    const lockedSet = new Set(lockedRows.filter((r) => r.locked).map((r) => r.studentId));

    const classes = Array.from(new Set(rows.map((r) => r.className))).sort((a, b) => a.localeCompare(b, "ar"));
    const students = rows.map((r) => ({ ...serializeProgress(r), locked: lockedSet.has(r.studentId) }));
    const quizRows = students.filter((s) => s.quizScore !== null && s.quizTotal);
    const summary = {
      total: students.length,
      completed: students.filter((s) => s.completed).length,
      averageProgress:
        students.length > 0
          ? Math.round(
              (students.reduce((acc, s) => acc + (s.maxSlide + 1) / TOTAL_SLIDES, 0) / students.length) * 100,
            )
          : 0,
      averageQuizPercent:
        quizRows.length > 0
          ? Math.round(
              (quizRows.reduce((acc, s) => acc + (s.quizScore! / (s.quizTotal || 1)), 0) / quizRows.length) * 100,
            )
          : null,
    };
    return json({ ok: true, class: normalized, classes, totalSlides: TOTAL_SLIDES, summary, students }, { req });
  } catch (e) {
    return dbError(e, req);
  }
}

/* -------------------------------------------------------------------------- */
/*                              POST (save/upsert)                            */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("INVALID_JSON", 400, req);
  }
  try {
    const { row, identity } = await saveProgress({
      studentId: body.studentId as string | undefined,
      name: body.name as string | undefined,
      className: body.className as string | undefined,
      currentSlide: body.currentSlide as number | undefined,
      maxSlide: body.maxSlide as number | undefined,
      quizScore: body.quizScore as number | undefined,
      quizTotal: body.quizTotal as number | undefined,
      quizSubmitted: body.quizSubmitted as boolean | undefined,
      activities: body.activities as Record<string, unknown> | undefined,
      completed: body.completed as boolean | undefined,
    });
    return json({ ok: true, locked: identity.locked, progress: serializeProgress(row) }, { req });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SERVER_ERROR";
    if (msg === "MISSING_IDENTITY") return error("يجب إدخال الاسم والفصل", 400, req, { code: msg });
    if (isUniqueViolation(e)) return error("هذا الاسم مسجل مسبقاً لطالب آخر في الفصل", 409, req, { code: "NAME_TAKEN" });
    return dbError(e, req);
  }
}

/* -------------------------------------------------------------------------- */
/*                               PATCH (teacher)                              */
/* -------------------------------------------------------------------------- */

export async function PATCH(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("INVALID_JSON", 400, req);
  }
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return error("studentId مطلوب", 400, req);

  try {
    const existing = await getProgress(studentId);
    if (!existing) return error("NOT_FOUND", 404, req);

    const set: Partial<typeof lessonProgress.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === "string" && cleanDisplayName(body.name)) {
      set.name = cleanDisplayName(body.name);
      set.nameKey = normalizeNameKey(set.name);
    }
    if (typeof body.className === "string" && normalizeClassName(body.className)) {
      set.className = normalizeClassName(body.className);
      set.classRaw = body.className;
    }
    if (body.currentSlide !== undefined) set.currentSlide = Math.max(0, Math.min(TOTAL_SLIDES - 1, Number(body.currentSlide) || 0));
    if (body.maxSlide !== undefined) set.maxSlide = Math.max(0, Math.min(TOTAL_SLIDES - 1, Number(body.maxSlide) || 0));
    if (body.quizScore !== undefined) set.quizScore = body.quizScore === null ? null : Number(body.quizScore) || 0;
    if (body.quizTotal !== undefined) set.quizTotal = body.quizTotal === null ? null : Number(body.quizTotal) || 0;
    if (body.completed !== undefined) set.completed = Boolean(body.completed);
    if (body.activities && typeof body.activities === "object") {
      set.activities = { ...(existing.activities ?? {}), ...(body.activities as Record<string, unknown>) };
    }
    if (body.resetActivities === true) set.activities = {};

    const [row] = await db.update(lessonProgress).set(set).where(eq(lessonProgress.studentId, studentId)).returning();

    // Lock name/class by the teacher (default: lock when name or class was edited)
    const shouldLock = body.lock === undefined ? Boolean(set.name || set.className) : Boolean(body.lock);
    if (body.lock === false) {
      await db.delete(teacherNames).where(eq(teacherNames.studentId, studentId));
    } else if (shouldLock) {
      const now = new Date();
      await db
        .insert(teacherNames)
        .values({
          studentId,
          name: row.name,
          nameKey: normalizeNameKey(row.name),
          className: row.className,
          locked: true,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: teacherNames.studentId,
          set: { name: row.name, nameKey: normalizeNameKey(row.name), className: row.className, locked: true, updatedAt: now },
        });
    }
    const reg = await db.select({ locked: teacherNames.locked }).from(teacherNames).where(eq(teacherNames.studentId, studentId)).limit(1);
    return json({ ok: true, progress: serializeProgress(row), locked: Boolean(reg[0]?.locked) }, { req });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return error("يوجد طالب آخر بنفس الاسم في هذا الفصل — لا يمكن تكرار الاسم", 409, req, { code: "NAME_TAKEN" });
    }
    return dbError(e, req);
  }
}

/* -------------------------------------------------------------------------- */
/*                               DELETE (teacher)                             */
/* -------------------------------------------------------------------------- */

export async function DELETE(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  const params = new URL(req.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  const cls = params.get("class") ?? params.get("className");
  const all = params.get("all") === "true";
  const alsoNames = params.get("names") === "true";

  try {
    if (studentId) {
      const deleted = await db.delete(lessonProgress).where(eq(lessonProgress.studentId, studentId)).returning({ id: lessonProgress.id });
      if (alsoNames) await db.delete(teacherNames).where(eq(teacherNames.studentId, studentId));
      return json({ ok: true, deleted: deleted.length }, { req });
    }
    if (cls) {
      const normalized = normalizeClassName(cls);
      const deleted = await db.delete(lessonProgress).where(eq(lessonProgress.className, normalized)).returning({ id: lessonProgress.id });
      if (alsoNames) await db.delete(teacherNames).where(eq(teacherNames.className, normalized));
      return json({ ok: true, deleted: deleted.length, class: normalized }, { req });
    }
    if (all) {
      const deleted = await db.delete(lessonProgress).returning({ id: lessonProgress.id });
      if (alsoNames) await db.delete(teacherNames);
      return json({ ok: true, deleted: deleted.length }, { req });
    }
    return error("حدد studentId أو class أو all=true", 400, req);
  } catch (e) {
    return dbError(e, req);
  }
}
