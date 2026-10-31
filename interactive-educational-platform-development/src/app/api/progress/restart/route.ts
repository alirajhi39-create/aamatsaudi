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

type PastRun = { round: number; finishedAt: string | null; restartedAt: string; quizScore: number | null; quizTotal: number | null; quizAttempts: number; completed: boolean; maxSlide: number };

/**
 * Student restarts the lesson after finishing it:
 *  - all activities + quiz are cleared and the student goes back to slide 0
 *  - the previous run is archived inside activities.__history (visible to the teacher)
 *  - name / class / studentId stay exactly the same (one record per student)
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

    const acts = (existing.activities ?? {}) as Record<string, unknown>;
    const history = Array.isArray(acts.__history) ? (acts.__history as PastRun[]) : [];
    const exit = (acts.exit ?? {}) as { finishedAt?: string };
    const archived: PastRun = {
      round: history.length + 1,
      finishedAt: exit.finishedAt ?? null,
      restartedAt: new Date().toISOString(),
      quizScore: existing.quizScore,
      quizTotal: existing.quizTotal,
      quizAttempts: existing.quizAttempts,
      completed: existing.completed,
      maxSlide: existing.maxSlide,
    };
    const now = new Date();
    const [row] = await db
      .update(lessonProgress)
      .set({
        currentSlide: 0,
        maxSlide: 0,
        quizScore: null,
        quizTotal: null,
        quizAttempts: 0,
        completed: false,
        activities: { __history: [...history, archived].slice(-10) },
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
