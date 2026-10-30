import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherNames } from "@/db/schema";
import { error, json, preflight } from "@/lib/cors";
import { FIXED_CLASS } from "@/lib/config";
import { cleanDisplayName, normalizeNameKey } from "@/lib/normalize";
import {
  findProgressByNameKey,
  findTeacherNameByClassAndName,
  getProgress,
  isUniqueViolation,
  resolveIdentity,
  saveProgress,
  serializeProgress,
} from "@/lib/progress-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

async function isLocked(studentId: string) {
  const reg = await db.select({ locked: teacherNames.locked }).from(teacherNames).where(eq(teacherNames.studentId, studentId)).limit(1);
  return Boolean(reg[0]?.locked);
}

/**
 * Student entry point (single class: FIXED_CLASS).
 *  - Resuming with a known studentId (same device) → returns saved progress.
 *  - New login by name → names are unique per class. If the name already exists the API answers
 *    409 NAME_TAKEN; the client must send `confirmResume: true` to continue that record.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return error("INVALID_JSON", 400, req);
  }

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const name = cleanDisplayName(body.name as string | undefined);
  const confirmResume = body.confirmResume === true;
  const className = FIXED_CLASS;

  if (!studentId && !name) return error("يرجى إدخال الاسم", 400, req, { code: "MISSING_FIELDS" });

  try {
    // 1) Resume with a known id (same device)
    if (studentId) {
      const existing = await getProgress(studentId);
      if (existing) {
        const { row, identity } = await saveProgress({
          studentId: existing.studentId,
          name: existing.name,
          className,
          currentSlide: existing.currentSlide,
          maxSlide: existing.maxSlide,
        });
        return json(
          {
            ok: true,
            resumed: true,
            student: { studentId: row.studentId, name: row.name, className: row.className, locked: identity.locked },
            progress: serializeProgress(row),
          },
          { req },
        );
      }
    }

    if (!name || name.length < 2) return error("الاسم قصير جداً", 400, req);
    const roster = await findTeacherNameByClassAndName(className, name);
    const words = name.split(" ").filter((w) => w.length >= 2);
    if (!roster && words.length < 2) {
      return error("اكتب اسمك الثلاثي كاملاً (مثال: محمد أحمد العتيبي)", 400, req, { code: "NAME_TOO_SHORT" });
    }

    // 2) New login by name — a name can exist only once in the class
    const identity = await resolveIdentity({ name, className });
    const nameKey = normalizeNameKey(identity.name);
    const existing = (await getProgress(identity.studentId)) ?? (await findProgressByNameKey(className, nameKey));

    if (existing && !confirmResume) {
      return json(
        {
          ok: false,
          code: "NAME_TAKEN",
          error: "هذا الاسم مسجل مسبقاً في الفصل",
          existing: {
            name: existing.name,
            currentSlide: existing.currentSlide,
            maxSlide: existing.maxSlide,
            completed: existing.completed,
            lastSeenAt: existing.lastSeenAt.toISOString(),
            locked: identity.locked,
          },
        },
        { req, status: 409 },
      );
    }

    const { row, identity: finalIdentity } = await saveProgress({
      studentId: existing?.studentId ?? identity.studentId,
      name: existing?.name ?? identity.name,
      className,
      currentSlide: existing?.currentSlide ?? 0,
      maxSlide: existing?.maxSlide ?? 0,
    });
    const locked = finalIdentity.locked || (await isLocked(row.studentId));
    return json(
      {
        ok: true,
        resumed: Boolean(existing),
        student: { studentId: row.studentId, name: row.name, className: row.className, locked },
        progress: serializeProgress(row),
      },
      { req },
    );
  } catch (e) {
    if (isUniqueViolation(e)) {
      return json({ ok: false, code: "NAME_TAKEN", error: "هذا الاسم مسجل مسبقاً في الفصل" }, { req, status: 409 });
    }
    return error(e instanceof Error ? e.message : "SERVER_ERROR", 500, req);
  }
}
