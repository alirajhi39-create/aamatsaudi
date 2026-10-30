import { NextRequest } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonProgress, teacherNames } from "@/db/schema";
import { error, json, preflight } from "@/lib/cors";
import { isTeacherAuthorized } from "@/lib/teacher-auth";
import { dbError, prepareDb } from "@/lib/db-errors";
import { cleanDisplayName, normalizeClassName, normalizeNameKey } from "@/lib/normalize";
import { deriveTeacherStudentId } from "@/lib/ids";
import { FIXED_CLASS } from "@/lib/config";
import { isUniqueViolation, serializeTeacherName } from "@/lib/progress-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

/** GET ?class=6/أ → roster for a class (public, used by the student login screen). No class → all (teacher). */
export async function GET(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  const params = new URL(req.url).searchParams;
  const cls = params.get("class") ?? params.get("className");
  try {
    // Names that already have a progress record are "claimed" (a student logged in with them)
    const claimedRows = await db.select({ studentId: lessonProgress.studentId }).from(lessonProgress);
    const claimed = new Set(claimedRows.map((r) => r.studentId));
    if (cls) {
      const normalized = normalizeClassName(cls);
      const rows = await db
        .select()
        .from(teacherNames)
        .where(eq(teacherNames.className, normalized))
        .orderBy(asc(teacherNames.name));
      return json(
        {
          ok: true,
          class: normalized,
          names: rows.map((r) => ({ studentId: r.studentId, name: r.name, locked: r.locked, claimed: claimed.has(r.studentId) })),
        },
        { req },
      );
    }
    const rows = await db.select().from(teacherNames).orderBy(asc(teacherNames.className), asc(teacherNames.name));
    const classes = await db
      .select({ className: teacherNames.className, count: sql<number>`count(*)::int` })
      .from(teacherNames)
      .groupBy(teacherNames.className)
      .orderBy(asc(teacherNames.className));
    return json(
      { ok: true, classes, names: rows.map((r) => ({ ...serializeTeacherName(r), claimed: claimed.has(r.studentId) })) },
      { req },
    );
  } catch (e) {
    return dbError(e, req);
  }
}

/** POST { className, names: string[] | string } → bulk register names (teacher). */
export async function POST(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  let body: { className?: string; names?: string[] | string; locked?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("INVALID_JSON", 400, req);
  }
  // Single-class platform: every roster entry belongs to FIXED_CLASS
  const className = FIXED_CLASS;
  const rawNames = Array.isArray(body.names) ? body.names : String(body.names ?? "").split(/\r?\n|،|,|;/);
  const names = Array.from(new Set(rawNames.map((n) => cleanDisplayName(n)).filter((n) => n.length >= 2)));
  if (names.length === 0) return error("لم يتم إدخال أسماء", 400, req);

  try {
    const now = new Date();
    const inserted: string[] = [];
    const skipped: string[] = [];
    // Existing progress rows in this class (compared by normalized name key, so "أحمد" = "احمد")
    const classProgress = await db
      .select({ studentId: lessonProgress.studentId, name: lessonProgress.name })
      .from(lessonProgress)
      .where(eq(lessonProgress.className, className));
    const registered = await db.select({ studentId: teacherNames.studentId }).from(teacherNames);
    const registeredIds = new Set(registered.map((r) => r.studentId));
    for (const name of names) {
      const nameKey = normalizeNameKey(name);
      // Reuse an existing free-student id if that student already has progress, so it gets locked in place.
      const existing = classProgress.find((p) => normalizeNameKey(p.name) === nameKey && !registeredIds.has(p.studentId));
      const studentId = existing?.studentId ?? deriveTeacherStudentId(className, name);
      const res = await db
        .insert(teacherNames)
        .values({ studentId, name, nameKey, className, locked: body.locked ?? true, updatedAt: now })
        .onConflictDoNothing()
        .returning({ id: teacherNames.id });
      if (res.length > 0) inserted.push(name);
      else skipped.push(name);
    }
    const rows = await db.select().from(teacherNames).where(eq(teacherNames.className, className)).orderBy(asc(teacherNames.name));
    return json({ ok: true, class: className, inserted, skipped, names: rows.map(serializeTeacherName) }, { req, status: 201 });
  } catch (e) {
    return dbError(e, req);
  }
}

/** PATCH { studentId, name?, className?, locked? } (teacher). Also syncs lesson_progress. */
export async function PATCH(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  let body: { studentId?: string; name?: string; className?: string; locked?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("INVALID_JSON", 400, req);
  }
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return error("studentId مطلوب", 400, req);
  try {
    const set: Partial<typeof teacherNames.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined && cleanDisplayName(body.name)) {
      set.name = cleanDisplayName(body.name);
      set.nameKey = normalizeNameKey(body.name);
    }
    if (body.className !== undefined && normalizeClassName(body.className)) set.className = normalizeClassName(body.className);
    if (body.locked !== undefined) set.locked = Boolean(body.locked);
    const [row] = await db.update(teacherNames).set(set).where(eq(teacherNames.studentId, studentId)).returning();
    if (!row) return error("NOT_FOUND", 404, req);
    await db
      .update(lessonProgress)
      .set({ name: row.name, nameKey: normalizeNameKey(row.name), className: row.className, updatedAt: new Date() })
      .where(eq(lessonProgress.studentId, studentId));
    return json({ ok: true, entry: serializeTeacherName(row) }, { req });
  } catch (e) {
    if (isUniqueViolation(e)) return error("يوجد اسم مطابق في هذا الفصل — لا يمكن تكرار الاسم", 409, req);
    return dbError(e, req);
  }
}

/** DELETE ?studentId= | ?class= | ?all=true (teacher). */
export async function DELETE(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  const params = new URL(req.url).searchParams;
  const studentId = params.get("studentId")?.trim();
  const cls = params.get("class") ?? params.get("className");
  try {
    if (studentId) {
      const d = await db.delete(teacherNames).where(eq(teacherNames.studentId, studentId)).returning({ id: teacherNames.id });
      return json({ ok: true, deleted: d.length }, { req });
    }
    if (cls) {
      const normalized = normalizeClassName(cls);
      const d = await db.delete(teacherNames).where(eq(teacherNames.className, normalized)).returning({ id: teacherNames.id });
      return json({ ok: true, deleted: d.length, class: normalized }, { req });
    }
    if (params.get("all") === "true") {
      const d = await db.delete(teacherNames).returning({ id: teacherNames.id });
      return json({ ok: true, deleted: d.length }, { req });
    }
    return error("حدد studentId أو class أو all=true", 400, req);
  } catch (e) {
    return dbError(e, req);
  }
}
