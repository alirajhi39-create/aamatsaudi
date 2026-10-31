import type { ProgressRecord } from "@/lib/client-api";

/** A preserved previous attempt (see /api/progress/restart). */
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
  activities: Record<string, unknown>;
};

/** One attempt in a uniform shape (past or current) for side-by-side display. */
export type Attempt = {
  round: number;
  current: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  currentSlide: number;
  maxSlide: number;
  quizScore: number | null;
  quizTotal: number | null;
  quizAttempts: number;
  completed: boolean;
  activities: Record<string, unknown>;
};

export function pastRuns(s: ProgressRecord): PastRun[] {
  const h = (s.activities as Record<string, unknown> | undefined)?.__history;
  if (!Array.isArray(h)) return [];
  return (h as Partial<PastRun>[]).map((r, i) => ({
    round: r.round ?? i + 1,
    startedAt: r.startedAt ?? null,
    finishedAt: r.finishedAt ?? null,
    restartedAt: r.restartedAt ?? "",
    currentSlide: r.currentSlide ?? r.maxSlide ?? 0,
    maxSlide: r.maxSlide ?? 0,
    quizScore: r.quizScore ?? null,
    quizTotal: r.quizTotal ?? null,
    quizAttempts: r.quizAttempts ?? 0,
    completed: Boolean(r.completed),
    activities: (r.activities as Record<string, unknown> | undefined) ?? {},
  }));
}

/** Number of the attempt the student is currently on (1 = first time). */
export function currentRound(s: ProgressRecord): number {
  return pastRuns(s).length + 1;
}

/** Activities of the current attempt only (internal keys removed). */
export function currentActivities(s: ProgressRecord): Record<string, unknown> {
  const acts = { ...((s.activities ?? {}) as Record<string, unknown>) };
  delete acts.__history;
  delete acts.__roundStartedAt;
  return acts;
}

/** All attempts, oldest first, with the current one last. */
export function allAttempts(s: ProgressRecord): Attempt[] {
  const past: Attempt[] = pastRuns(s).map((r) => ({ ...r, current: false }));
  const exit = (currentActivities(s).exit ?? {}) as { finishedAt?: string };
  const startedAt = (s.activities as Record<string, unknown> | undefined)?.__roundStartedAt;
  past.push({
    round: past.length + 1,
    current: true,
    startedAt: typeof startedAt === "string" ? startedAt : past.length === 0 ? s.createdAt : null,
    finishedAt: exit.finishedAt ?? (s.completed ? s.updatedAt : null),
    currentSlide: s.currentSlide,
    maxSlide: s.maxSlide,
    quizScore: s.quizScore,
    quizTotal: s.quizTotal,
    quizAttempts: s.quizAttempts,
    completed: s.completed,
    activities: currentActivities(s),
  });
  return past;
}

/** Best quiz percentage over all attempts (null when never tested). */
export function bestQuizPercent(s: ProgressRecord): number | null {
  let best: number | null = null;
  for (const a of allAttempts(s)) {
    if (a.quizScore !== null && a.quizTotal) {
      const p = Math.round((a.quizScore / a.quizTotal) * 100);
      best = best === null ? p : Math.max(best, p);
    }
  }
  return best;
}

/**
 * The student's best attempt: highest quiz percentage, then completed lesson, then furthest
 * progress, then the most recent one.
 */
export function bestAttempt(s: ProgressRecord): Attempt {
  const attempts = allAttempts(s);
  const score = (a: Attempt) => {
    const quiz = a.quizScore !== null && a.quizTotal ? a.quizScore / a.quizTotal : -1;
    return [quiz, a.completed ? 1 : 0, a.maxSlide, a.round] as const;
  };
  return attempts.reduce((best, a) => {
    const x = score(a);
    const y = score(best);
    for (let i = 0; i < x.length; i++) {
      if (x[i] > y[i]) return a;
      if (x[i] < y[i]) return best;
    }
    return best;
  }, attempts[0]);
}

/** Record view of the best attempt (progress + quiz + activities of that attempt). */
export function bestAttemptRecord(s: ProgressRecord): ProgressRecord & { __bestRound: number; __attempts: number } {
  const a = bestAttempt(s);
  return { ...attemptAsRecord(s, a), activities: { ...a.activities }, __bestRound: a.round, __attempts: allAttempts(s).length };
}

/** Build a pseudo ProgressRecord for a past attempt so existing summaries/tables can render it. */
export function attemptAsRecord(s: ProgressRecord, a: Attempt): ProgressRecord {
  return {
    ...s,
    currentSlide: a.currentSlide,
    maxSlide: a.maxSlide,
    quizScore: a.quizScore,
    quizTotal: a.quizTotal,
    quizAttempts: a.quizAttempts,
    completed: a.completed,
    activities: a.activities,
  };
}
