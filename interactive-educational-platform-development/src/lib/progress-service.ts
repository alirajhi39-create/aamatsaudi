import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lessonProgress, teacherNames, type LessonProgressRow, type TeacherNameRow } from "@/db/schema";
import { cleanDisplayName, normalizeClassName, normalizeNameKey } from "@/lib/normalize";
import { deriveStudentId } from "@/lib/ids";
import { FIXED_CLASS } from "@/lib/config";

export const LESSON_ID = "ssa2-imams";
export const TOTAL_SLIDES = 20;

export function serializeProgress(row: LessonProgressRow) {
  return {
    id: row.id,
    studentId: row.studentId,
    name: row.name,
    className: row.className,
    classRaw: row.classRaw,
    currentSlide: row.currentSlide,
    maxSlide: row.maxSlide,
    quizScore: row.quizScore,
    quizTotal: row.quizTotal,
    quizAttempts: row.quizAttempts,
    activities: row.activities ?? {},
    completed: row.completed,
    lastSeenAt: row.lastSeenAt?.toISOString?.() ?? row.lastSeenAt,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

export type SerializedProgress = ReturnType<typeof serializeProgress>;

export function serializeTeacherName(row: TeacherNameRow) {
  return {
    id: row.id,
    studentId: row.studentId,
    name: row.name,
    className: row.className,
    locked: row.locked,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
  };
}

/** Find the teacher-registered entry for a student id (if any). */
export async function findTeacherNameByStudentId(studentId: string) {
  const rows = await db.select().from(teacherNames).where(eq(teacherNames.studentId, studentId)).limit(1);
  return rows[0] ?? null;
}

/** Find the teacher-registered entry by (class, name). */
export async function findTeacherNameByClassAndName(className: string, name: string) {
  const cls = normalizeClassName(className);
  const key = normalizeNameKey(name);
  if (!cls || !key) return null;
  const rows = await db
    .select()
    .from(teacherNames)
    .where(and(eq(teacherNames.className, cls), eq(teacherNames.nameKey, key)))
    .limit(1);
  return rows[0] ?? null;
}

/** Find an existing progress row by normalized name within a class (names are unique per class). */
export async function findProgressByNameKey(className: string, nameKey: string) {
  if (!className || !nameKey) return null;
  const rows = await db
    .select()
    .from(lessonProgress)
    .where(and(eq(lessonProgress.className, className), eq(lessonProgress.nameKey, nameKey)))
    .limit(1);
  return rows[0] ?? null;
}

/** True when a PostgreSQL unique-constraint violation (23505) bubbled up from Drizzle/pg. */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } } | null;
  if (!err) return false;
  if (err.code === "23505" || err.cause?.code === "23505") return true;
  return /duplicate key value/i.test(err.message ?? "") || /duplicate key value/i.test(err.cause?.message ?? "");
}

/**
 * Resolve the identity of a student. Teacher-registered names always win and are locked.
 * The platform serves a single class, so every record is normalised to FIXED_CLASS.
 */
export async function resolveIdentity(input: { studentId?: string | null; name?: string | null; className?: string | null }) {
  const name = cleanDisplayName(input.name);
  const classRaw = String(input.className ?? "").trim();
  const className = FIXED_CLASS;

  // 1. Explicit id registered by the teacher → locked
  if (input.studentId) {
    const t = await findTeacherNameByStudentId(input.studentId);
    if (t && t.locked) {
      return { studentId: t.studentId, name: t.name, className: t.className, classRaw, locked: true };
    }
  }

  // 2. Match by class + name against the teacher roster
  if (name) {
    const t = await findTeacherNameByClassAndName(className, name);
    if (t) {
      return { studentId: t.studentId, name: t.name, className: t.className, classRaw, locked: t.locked };
    }
  }

  // 3. Free student (not registered)
  const studentId = input.studentId || (name ? deriveStudentId(className, name) : "");
  return { studentId, name, className, classRaw, locked: false };
}

export type SaveInput = {
  studentId?: string | null;
  name?: string | null;
  className?: string | null;
  currentSlide?: number | null;
  maxSlide?: number | null;
  quizScore?: number | null;
  quizTotal?: number | null;
  quizSubmitted?: boolean | null;
  activities?: Record<string, unknown> | null;
  completed?: boolean | null;
};

function toInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

/** Upsert a progress record (student POST). Name/class come from the resolved identity. */
export async function saveProgress(input: SaveInput) {
  const identity = await resolveIdentity(input);
  if (!identity.studentId || !identity.name || !identity.className) {
    throw new Error("MISSING_IDENTITY");
  }
  const nameKey = normalizeNameKey(identity.name);
  const currentSlide = Math.min(toInt(input.currentSlide, 0), TOTAL_SLIDES - 1);
  const maxSlide = Math.max(currentSlide, Math.min(toInt(input.maxSlide, currentSlide), TOTAL_SLIDES - 1));
  const activities = input.activities && typeof input.activities === "object" ? input.activities : {};
  const hasQuiz = input.quizScore !== undefined && input.quizScore !== null;
  const quizScore = hasQuiz ? toInt(input.quizScore) : null;
  const quizTotal = hasQuiz ? toInt(input.quizTotal, 0) : null;
  const completed = Boolean(input.completed);
  const now = new Date();

  const [row] = await db
    .insert(lessonProgress)
    .values({
      studentId: identity.studentId,
      name: identity.name,
      nameKey,
      className: identity.className,
      classRaw: identity.classRaw || null,
      currentSlide,
      maxSlide,
      quizScore,
      quizTotal,
      quizAttempts: input.quizSubmitted ? 1 : 0,
      activities,
      completed,
      lastSeenAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: lessonProgress.studentId,
      set: {
        name: identity.name,
        nameKey,
        className: identity.className,
        classRaw: identity.classRaw || null,
        currentSlide,
        maxSlide: sql`GREATEST(${lessonProgress.maxSlide}, ${maxSlide})`,
        quizScore: hasQuiz ? quizScore : sql`${lessonProgress.quizScore}`,
        quizTotal: hasQuiz ? quizTotal : sql`${lessonProgress.quizTotal}`,
        quizAttempts: input.quizSubmitted
          ? sql`${lessonProgress.quizAttempts} + 1`
          : sql`${lessonProgress.quizAttempts}`,
        activities: sql`COALESCE(${lessonProgress.activities}, '{}'::jsonb) || ${JSON.stringify(activities)}::jsonb`,
        completed: sql`${lessonProgress.completed} OR ${completed}`,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return { row, identity };
}

/** Get a progress row by id. */
export async function getProgress(studentId: string) {
  const rows = await db.select().from(lessonProgress).where(eq(lessonProgress.studentId, studentId)).limit(1);
  return rows[0] ?? null;
}
