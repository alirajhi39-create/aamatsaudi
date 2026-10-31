import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonProgress } from "@/db/schema";
import { error, json, preflight } from "@/lib/cors";
import { dbError, prepareDb } from "@/lib/db-errors";
import { getProgress, serializeProgress } from "@/lib/progress-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

/** A fully preserved previous attempt (nothing from the first run is lost). */
export type PastRun = {
  round: number;
  startedAt: string | null;
  finishedAt: string | null;
  restartedAt: string;
  currentSlide: number;
  maxSlide: number;
  quizScore: number | null;
  quizTotal: number | null;
  quizAttempts: number;
  completed: boolean;
  /** All activity answers of that attempt (quiz answers, writing choices, exit ticket, …) */
  activities: Record<string, unknown>;
};

/**
 * Student restarts the lesson after finishing it.
 *  - Nothing is deleted: the whole previous attempt (progress, quiz score, every activity answer)
 *    is archived into activities.__history and stays visible to the teacher side by side with
 *    the new attempt.
 *  - The student keeps the same name / class / studentId and starts a fresh attempt at slide 0.
 */
export async function POST(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  let body: { studentId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error("INVALID_JSON", 400, req);
  }
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return error("studentId مطلوب", 400, req);

  try {
    const existing = await getProgress(studentId);
    if (!existing) return error("NOT_FOUND", 404, req);

    const acts = { ...((existing.activities ?? {}) as Record<string, unknown>) };
    const history = Array.isArray(acts.__history) ? (acts.__history as PastRun[]) : [];
    const roundStartedAt = typeof acts.__roundStartedAt === "string" ? acts.__roundStartedAt : null;
    delete acts.__history;
    delete acts.__roundStartedAt;

    const exit = (acts.exit ?? {}) as { finishedAt?: string };
    const now = new Date();
    const archived: PastRun = {
      round: history.length + 1,
      startedAt: roundStartedAt ?? existing.createdAt.toISOString(),
      finishedAt: exit.finishedAt ?? (existing.completed ? existing.updatedAt.toISOString() : null),
      restartedAt: now.toISOString(),
      currentSlide: existing.currentSlide,
      maxSlide: existing.maxSlide,
      quizScore: existing.quizScore,
      quizTotal: existing.quizTotal,
      quizAttempts: existing.quizAttempts,
      completed: existing.completed,
      activities: acts,
    };

    const [row] = await db
      .update(lessonProgress)
      .set({
        currentSlide: 0,
        maxSlide: 0,
        quizScore: null,
        quizTotal: null,
        quizAttempts: 0,
        completed: false,
        activities: { __history: [...history, archived], __roundStartedAt: now.toISOString() },
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(lessonProgress.studentId, studentId))
      .returning();

    return json({ ok: true, round: archived.round + 1, progress: serializeProgress(row) }, { req });
  } catch (e) {
    return dbError(e, req);
  }
}
