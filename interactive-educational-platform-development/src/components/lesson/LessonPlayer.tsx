"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LESSON_TITLE, SLIDES, TOTAL_SLIDES } from "@/lib/lesson-content";
import { FIXED_CLASS_LABEL } from "@/lib/config";
import { getSession, loginStudent, restartLessonRemote, saveProgressRemote, setSession, type SavePayload, type StudentSession } from "@/lib/client-api";
import { sound } from "@/lib/sound";
import { narrationKey } from "@/lib/sound-keys";
import { StrategyBadge, cx, useToast } from "@/components/ui";
import SlideTimer, { type TimerState } from "./SlideTimer";
import type { SlideProps, SlideValue } from "./types";
import { AbdullahSlide, BattleSlide, CoverSlide, KwlSlide, ReadingFaisalSlide, StorySlide, ValuesSlide } from "./ReadingSlides";
import { CauseEffectSlide, CausesSlide, ClassifySlide, MatchingSlide, MindmapSlide, TimelineSlide, TrueFalseSlide } from "./InteractiveSlides";
import { MapSlide } from "./MapSlide";
import { OrderingSlide } from "./OrderingSlide";
import { Activity1Slide, Activity2Slide, ExitSlide, QuizSlide } from "./AssessmentSlides";

type Activities = Record<string, SlideValue>;
type QuizState = { score: number | null; total: number | null; attempts: number };

const SLIDE_COMPONENTS: Record<string, (p: SlideProps) => React.JSX.Element> = {
  cover: CoverSlide,
  kwl: KwlSlide,
  timeline: TimelineSlide,
  "reading-faisal": ReadingFaisalSlide,
  battle: BattleSlide,
  "cause-effect": CauseEffectSlide,
  story: StorySlide,
  activity1: Activity1Slide,
  map: MapSlide,
  abdullah: AbdullahSlide,
  causes: CausesSlide,
  abdulrahman: ClassifySlide,
  values: ValuesSlide,
  ordering: OrderingSlide,
  activity2: Activity2Slide,
  mindmap: MindmapSlide,
  matching: MatchingSlide,
  truefalse: TrueFalseSlide,
  quiz: QuizSlide,
  exit: ExitSlide,
};

/* ----------------------------- Narration bar ----------------------------- */
function NarrationBar({
  narrating,
  muted,
  custom,
  onNarrate,
  onMute,
}: {
  narrating: boolean;
  muted: boolean;
  custom: boolean;
  onNarrate: () => void;
  onMute: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white/85 p-2 ring-1 ring-black/5">
      <button
        type="button"
        onClick={onNarrate}
        aria-pressed={narrating}
        className={cx(
          "btn flex-1 text-lg sm:min-w-64 sm:flex-none",
          narrating ? "bg-maroon text-white shadow-md shadow-maroon/30 hover:bg-maroon-dark" : "bg-saudi text-white shadow-md shadow-saudi/30 hover:bg-saudi-dark",
        )}
      >
        {narrating ? (
          <>
            <span className="eq" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </span>
            ⏹ إيقاف الصوت
          </>
        ) : (
          <>🔊 استمع إلى الشرح</>
        )}
      </button>
      <span className="hidden text-sm text-ink/50 md:inline">{custom ? "🎙️ تسجيل المعلم" : "🤖 قراءة آلية"}</span>
      <button
        type="button"
        onClick={onMute}
        className="btn-secondary px-3 py-3 text-lg"
        title={muted ? "تشغيل المؤثرات الصوتية" : "كتم المؤثرات الصوتية"}
        aria-label={muted ? "تشغيل المؤثرات الصوتية" : "كتم المؤثرات الصوتية"}
      >
        {muted ? "🔕" : "🔔"}
      </button>
    </div>
  );
}

export default function LessonPlayer() {
  const router = useRouter();
  const { toast, Toast } = useToast();
  const [session, setSessionState] = useState<StudentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [maxIndex, setMaxIndex] = useState(0);
  const [activities, setActivities] = useState<Activities>({});
  const [quiz, setQuiz] = useState<QuizState>({ score: null, total: null, attempts: 0 });
  const [completed, setCompleted] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [muted, setMuted] = useState(false);
  const [narrating, setNarrating] = useState(false);
  const [, setTick] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);

  const dirty = useRef(false);
  const quizSubmitRef = useRef<{ score: number; total: number } | null>(null);
  const latest = useRef<SavePayload | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------ bootstrap ------------------------------ */
  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setSessionState(s);
    setMuted(sound?.muted ?? false);
    const unsub = sound?.subscribe(() => {
      setMuted(sound.muted);
      setNarrating(sound.narrating);
      setTick((t) => t + 1);
    });
    void sound?.load();
    (async () => {
      try {
        const res = await loginStudent({ studentId: s.studentId, name: s.name, className: s.className });
        if (!res.ok) throw new Error(res.error);
        const p = res.progress;
        const st = res.student;
        setSession(st);
        setSessionState(st);
        setActivities((p.activities as Activities) ?? {});
        setIndex(Math.min(p.currentSlide, TOTAL_SLIDES - 1));
        setMaxIndex(Math.min(Math.max(p.maxSlide, p.currentSlide), TOTAL_SLIDES - 1));
        setQuiz({ score: p.quizScore, total: p.quizTotal, attempts: p.quizAttempts });
        setCompleted(p.completed);
        if (p.currentSlide > 0) toast(`تم استئناف تقدمك من الشريحة ${p.currentSlide + 1} 👋`);
        setTimeout(() => sound?.play("welcome"), 400);
      } catch (e) {
        toast(e instanceof Error ? e.message : "تعذر الاتصال بالخادم", "err");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------- autosave ------------------------------- */
  const buildPayload = useCallback((): SavePayload | null => {
    if (!session) return null;
    const payload: SavePayload = {
      studentId: session.studentId,
      name: session.name,
      className: session.className,
      currentSlide: index,
      maxSlide: maxIndex,
      activities,
      completed,
    };
    if (quiz.score !== null && quiz.total !== null) {
      payload.quizScore = quiz.score;
      payload.quizTotal = quiz.total;
    }
    return payload;
  }, [session, index, maxIndex, activities, completed, quiz]);

  const flush = useCallback(async (keepalive = false) => {
    const payload = latest.current;
    if (!payload || !dirty.current) return;
    dirty.current = false;
    const submit = quizSubmitRef.current;
    quizSubmitRef.current = null;
    const body: SavePayload = submit ? { ...payload, quizScore: submit.score, quizTotal: submit.total, quizSubmitted: true } : payload;
    try {
      setSaveState("saving");
      const res = await saveProgressRemote(body, keepalive);
      if (res.progress) {
        const attempts = res.progress.quizAttempts;
        setQuiz((q) => (q.attempts === attempts ? q : { ...q, attempts }));
        if (res.progress.name !== payload.name || res.progress.className !== payload.className) {
          const st = { ...payload, name: res.progress.name, className: res.progress.className, locked: Boolean(res.locked) } as StudentSession;
          setSession(st);
          setSessionState(st);
        }
      }
      setSaveState("saved");
    } catch {
      dirty.current = true;
      if (submit) quizSubmitRef.current = submit;
      setSaveState("error");
    }
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    latest.current = buildPayload();
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [buildPayload, flush, loading, session]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush(true);
    };
    const onUnload = () => void flush(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [flush]);

  /* ------------------------------ navigation ------------------------------ */
  const slide = SLIDES[index];
  const slideValue = useMemo(() => activities[slide.id] ?? {}, [activities, slide.id]);
  const isDone = Boolean(slideValue.done);

  const update = useCallback((id: string, patch: SlideValue) => {
    setActivities((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch, updatedAt: new Date().toISOString() } }));
  }, []);
  const markDone = useCallback((id: string, extra?: SlideValue) => {
    setActivities((prev) => {
      if (prev[id]?.done) return extra ? { ...prev, [id]: { ...prev[id], ...extra } } : prev;
      return { ...prev, [id]: { ...(prev[id] ?? {}), ...(extra ?? {}), done: true, doneAt: new Date().toISOString() } };
    });
  }, []);

  const goTo = useCallback((i: number) => {
    if (i < 0 || i >= TOTAL_SLIDES) return;
    sound?.stopNarration();
    sound?.play("click");
    setIndex(i);
    setMaxIndex((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const next = useCallback(() => {
    if (!isDone && index !== 0) return;
    goTo(index + 1);
  }, [goTo, index, isDone]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") next();
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const onQuizSubmit = useCallback((score: number, total: number) => {
    quizSubmitRef.current = { score, total };
    setQuiz((q) => ({ ...q, score, total }));
  }, []);

  const onLessonComplete = useCallback(() => setCompleted(true), []);

  const toggleNarration = () => {
    if (narrating) sound.stopNarration();
    else void sound.narrateSlide(index, slide.narration);
  };

  const logout = () => {
    void flush(true);
    sound?.stopNarration();
    setSession(null);
    router.push("/");
  };

  /** Restart the lesson for the same student: server clears progress, client state follows. */
  const restartLesson = useCallback(async () => {
    if (!session || restarting) return;
    setRestarting(true);
    try {
      // Drop any pending autosave so it cannot overwrite the reset with stale data.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirty.current = false;
      quizSubmitRef.current = null;
      const res = await restartLessonRemote(session.studentId);
      sound?.stopNarration();
      setActivities((res.progress.activities as Activities) ?? {});
      setQuiz({ score: null, total: null, attempts: 0 });
      setCompleted(false);
      setMaxIndex(0);
      setIndex(0);
      setConfirmRestart(false);
      latest.current = null;
      setSaveState("saved");
      window.scrollTo({ top: 0, behavior: "smooth" });
      sound?.play("welcome");
      toast(`بدأت الدرس من جديد (المحاولة ${res.round}) 🔁`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "تعذر إعادة الدرس", "err");
    } finally {
      setRestarting(false);
    }
  }, [session, restarting, toast]);

  const round = (Array.isArray(activities.__history) ? (activities.__history as unknown[]).length : 0) + 1;

  /* -------------------------------- render -------------------------------- */
  if (!session || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="card flex flex-col items-center gap-3 p-8">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-saudi border-t-transparent" />
          <p className="font-heading text-lg font-bold text-saudi">جارٍ تحميل تقدمك...</p>
        </div>
      </div>
    );
  }

  const Comp = SLIDE_COMPONENTS[slide.id];
  const percent = Math.round(((maxIndex + 1) / TOTAL_SLIDES) * 100);
  const doneCount = SLIDES.filter((s) => activities[s.id]?.done).length;
  const customNarration = Boolean(sound?.hasCustom(narrationKey(index)));
  const canGoNext = index !== TOTAL_SLIDES - 1 && (isDone || index === 0);

  return (
    <div className="flex min-h-screen flex-col">
      {Toast}
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-saudi text-xl text-white">🏰</span>
            <div className="hidden md:block">
              <p className="font-heading text-sm font-extrabold leading-tight text-saudi">{LESSON_TITLE}</p>
              <p className="text-[11px] text-ink/50">الدراسات الاجتماعية — السادس الابتدائي</p>
            </div>
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-sand px-3 py-1.5">
            <span className="text-lg">👧🏻</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold sm:text-base">
                {session.name} {session.locked && <span title="الاسم مثبت من قبل المعلم">🔒</span>}
              </p>
              <p className="text-[11px] text-ink/60">فصل {FIXED_CLASS_LABEL}</p>
            </div>
          </div>
          <span
            title={saveState === "saving" ? "جارٍ الحفظ" : saveState === "error" ? "تعذر الحفظ" : "محفوظ"}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-bold",
              saveState === "saving" ? "bg-amber-50 text-amber-700" : saveState === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
            )}
          >
            {saveState === "saving" ? "⏳" : saveState === "error" ? "⚠️" : "☁️"}
            <span className="hidden sm:inline">{saveState === "saving" ? "جارٍ الحفظ" : saveState === "error" ? "تعذر الحفظ" : "محفوظ"}</span>
          </span>
          <button className="btn-ghost shrink-0 px-3 py-2" title="خريطة الدرس" aria-label="خريطة الدرس" onClick={() => setShowMap((s) => !s)}>
            🗂️
          </button>
          <button className="btn-ghost shrink-0 px-3 py-2 text-rose-700" title="خروج" aria-label="خروج" onClick={logout}>
            🚪
          </button>
        </div>
        {/* Progress */}
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-sand-dark">
              <div className="h-full rounded-full bg-gradient-to-l from-saudi to-gold transition-all duration-700" style={{ width: `${percent}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs font-bold text-ink/60">
              {index + 1}/{TOTAL_SLIDES} · {doneCount} مكتمل
            </span>
          </div>
        </div>
        {showMap && (
          <div className="border-t border-black/5 bg-white">
            <div className="mx-auto grid max-w-6xl grid-cols-4 gap-1.5 px-3 py-3 sm:grid-cols-5 sm:px-6 lg:grid-cols-10">
              {SLIDES.map((s, i) => {
                const d = Boolean(activities[s.id]?.done);
                const reachable = i <= maxIndex;
                return (
                  <button
                    key={s.id}
                    disabled={!reachable}
                    onClick={() => {
                      goTo(i);
                      setShowMap(false);
                    }}
                    title={s.title}
                    className={cx(
                      "flex flex-col items-center gap-0.5 rounded-xl p-1.5 text-center text-[11px] leading-tight transition",
                      i === index ? "bg-saudi text-white" : d ? "bg-emerald-50 text-emerald-800" : reachable ? "bg-sand hover:bg-saudi-light" : "bg-sand/40 text-ink/30",
                    )}
                  >
                    <span className="text-lg">{reachable ? s.icon : "🔒"}</span>
                    <span className="line-clamp-2">
                      {i + 1}. {s.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Slide */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 grid gap-3 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-heading text-2xl font-black text-ink sm:text-3xl">
              <span>{slide.icon}</span>
              {slide.title}
            </h2>
            <StrategyBadge strategy={slide.strategy} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <NarrationBar narrating={narrating} muted={muted} custom={customNarration} onNarrate={toggleNarration} onMute={() => sound.setMuted(!muted)} />
            </div>
            <SlideTimer slideId={slide.id} value={slideValue.timer as TimerState | undefined} onChange={(t) => update(slide.id, { timer: t })} />
          </div>
        </div>
        <div key={slide.id} className="slide-enter">
          <Comp
            value={slideValue}
            update={(patch) => update(slide.id, patch)}
            done={isDone}
            markDone={(extra) => markDone(slide.id, extra)}
            session={session}
            quiz={quiz}
            onQuizSubmit={onQuizSubmit}
            onLessonComplete={onLessonComplete}
            onRestart={() => setConfirmRestart(true)}
            onExit={logout}
            round={round}
            next={next}
          />
        </div>
      </main>

      {/* Restart confirmation */}
      {confirmRestart && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !restarting && setConfirmRestart(false)}>
          <div className="card pop w-full max-w-md rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-xl font-black text-maroon">🔁 إعادة الدرس من البداية؟</h3>
            <p className="mt-2 text-lg leading-relaxed">
              سيتم مسح إجاباتك ونتيجة الاختبار وتبدأ من الشريحة الأولى باسمك نفسه <b>{session.name}</b>. ستبقى نتيجتك السابقة محفوظة لدى المعلم كمحاولة سابقة.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn-secondary text-lg" onClick={() => setConfirmRestart(false)} disabled={restarting}>
                إلغاء
              </button>
              <button className="btn-maroon text-lg" onClick={() => void restartLesson()} disabled={restarting}>
                {restarting ? "لحظة..." : "نعم، أعد الدرس"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer nav */}
      <footer className="pb-safe sticky bottom-0 z-30 border-t border-black/5 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <button className="btn-ghost shrink-0 px-3 text-base text-rose-700 ring-1 ring-rose-200 sm:px-4" onClick={logout} title="حفظ والخروج من الدرس">
            🚪 <span className="hidden sm:inline">خروج</span>
          </button>
          <button className="btn-secondary flex-1 text-lg sm:flex-none sm:px-8" onClick={prev} disabled={index === 0}>
            ▶ السابق
          </button>
          <p className="hidden text-center text-base text-ink/60 md:block">
            {index === TOTAL_SLIDES - 1 ? (completed ? "أكملت الدرس 🎉" : "هذه آخر شريحة") : canGoNext ? "يمكنك الانتقال للشريحة التالية" : "أكمل النشاط للانتقال إلى الشريحة التالية"}
          </p>
          {index === TOTAL_SLIDES - 1 && completed ? (
            <button className="btn-maroon flex-1 text-lg sm:flex-none sm:px-8" onClick={() => setConfirmRestart(true)} disabled={restarting}>
              🔁 إعادة الدرس
            </button>
          ) : (
            <button className="btn-primary flex-1 text-lg sm:flex-none sm:px-8" onClick={next} disabled={!canGoNext}>
              التالي ◀
            </button>
          )}
        </div>
        {!canGoNext && index !== TOTAL_SLIDES - 1 && <p className="pb-1.5 text-center text-xs text-ink/60 md:hidden">أكمل النشاط للانتقال إلى الشريحة التالية</p>}
      </footer>
    </div>
  );
}
