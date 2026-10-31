"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SLIDES, TOTAL_SLIDES } from "@/lib/lesson-content";
import { summarizeActivities } from "@/lib/activity-summary";
import { allAttempts, attemptAsRecord, bestQuizPercent, currentRound, type Attempt } from "@/lib/attempts";
import { FIXED_CLASS, FIXED_CLASS_FULL, FIXED_CLASS_LABEL } from "@/lib/config";
import { formatDate, getTeacherPin, setTeacherPin, teacherFetch, type ProgressRecord } from "@/lib/client-api";
import { Modal, ProgressRing, cx, useToast } from "@/components/ui";
import SoundsManager from "./SoundsManager";

type Summary = { total: number; completed: number; averageProgress: number; averageQuizPercent: number | null };
type ListResponse = { ok: boolean; classes: string[]; summary: Summary; students: ProgressRecord[] };
type RosterEntry = { id: number; studentId: string; name: string; className: string; locked: boolean; claimed: boolean; createdAt: string };

/* -------------------------------- PIN gate -------------------------------- */
function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/teacher/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "رمز غير صحيح");
      setTeacherPin(pin);
      onOk();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-black text-saudi">👩‍🏫 لوحة تحكم المعلم</h1>
        <p className="mt-1 text-base text-ink/60">فصل {FIXED_CLASS_LABEL} — أدخل رمز الدخول الخاص بالمعلم.</p>
        <input className="input mt-4 text-center text-2xl tracking-widest" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••••" autoFocus />
        {err && <p className="mt-2 text-sm font-bold text-rose-700">{err}</p>}
        <button className="btn-primary mt-4 w-full text-lg" disabled={busy || !pin}>
          دخول
        </button>
        <Link href="/" className="mt-3 block text-center text-sm text-navy underline">
          العودة للصفحة الرئيسية
        </Link>
      </form>
    </div>
  );
}

/* ------------------------------ Helpers ------------------------------ */
function pct(s: ProgressRecord) {
  return Math.round(((s.maxSlide + 1) / TOTAL_SLIDES) * 100);
}
function quizPct(s: ProgressRecord) {
  return s.quizScore !== null && s.quizTotal ? Math.round((s.quizScore / s.quizTotal) * 100) : null;
}
function doneCount(s: ProgressRecord) {
  return SLIDES.filter((sl) => (s.activities?.[sl.id] as { done?: boolean } | undefined)?.done).length;
}
function act<T = Record<string, unknown>>(s: ProgressRecord, id: string): T {
  return (s.activities?.[id] as T) ?? ({} as T);
}
function toCsv(rows: ProgressRecord[]) {
  const head = ["الاسم", "الفصل", "الشريحة الحالية", "أقصى شريحة", "نسبة التقدم", "درجة الاختبار", "من", "النسبة", "المحاولات", "الأنشطة المكتملة", "مكتمل", "آخر ظهور"];
  const lines = rows.map((s) =>
    [s.name, s.className, s.currentSlide + 1, s.maxSlide + 1, `${pct(s)}%`, s.quizScore ?? "", s.quizTotal ?? "", quizPct(s) !== null ? `${quizPct(s)}%` : "", s.quizAttempts, doneCount(s), s.completed ? "نعم" : "لا", s.lastSeenAt]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return "\uFEFF" + [head.join(","), ...lines].join("\n");
}
function pctClass(p: number) {
  return p >= 80 ? "bg-emerald-50 text-emerald-700" : p >= 60 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700";
}
/** Quiz results of every attempt, side by side (oldest → current). */
function QuizChip({ s }: { s: ProgressRecord }) {
  const attempts = allAttempts(s);
  if (attempts.length === 1) {
    const qp = quizPct(s);
    if (qp === null) return <span className="text-ink/40">لم يختبر</span>;
    return (
      <span className={cx("chip", pctClass(qp))}>
        {s.quizScore}/{s.quizTotal} ({qp}%) — {s.quizAttempts} محاولة
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {attempts.map((a) => {
        const p = a.quizScore !== null && a.quizTotal ? Math.round((a.quizScore / a.quizTotal) * 100) : null;
        return (
          <span key={a.round} className={cx("chip", p === null ? "bg-sand text-ink/50" : pctClass(p), a.current && "ring-2 ring-saudi/40")} title={a.current ? "المحاولة الحالية" : `المحاولة ${a.round}`}>
            م{a.round}: {p === null ? "—" : `${a.quizScore}/${a.quizTotal}`}
          </span>
        );
      })}
    </span>
  );
}

/* ------------------------------ Dashboard ------------------------------ */
export default function TeacherDashboard() {
  const router = useRouter();
  const { toast, Toast } = useToast();
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<"students" | "roster" | "sounds" | "diagnose">("students");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"name" | "progress" | "quiz" | "recent">("name");
  const [detail, setDetail] = useState<ProgressRecord | null>(null);
  const [edit, setEdit] = useState<ProgressRecord | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [rosterNames, setRosterNames] = useState("");
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveState, setLiveState] = useState<"idle" | "syncing" | "error">("idle");
  const [, setTick] = useState(0);
  const prevSnapshot = useRef<Map<string, string> | null>(null);
  const changedIds = useRef<Set<string>>(new Set());
  const [, bumpChanged] = useState(0);

  useEffect(() => setAuthed(Boolean(getTeacherPin())), []);

  /** Load the class report. `silent` = background refresh (no spinner, toast only on new activity). */
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setLiveState("syncing");
      try {
        const res = await fetch(`/api/progress?class=${encodeURIComponent(FIXED_CLASS)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ListResponse;
        // Detect what changed since the previous snapshot (progress / quiz / completion / new students)
        const snap = new Map(json.students.map((s) => [s.studentId, `${s.currentSlide}|${s.maxSlide}|${s.quizScore}|${s.quizAttempts}|${s.completed}|${s.updatedAt}`]));
        if (prevSnapshot.current) {
          const changed = json.students.filter((s) => prevSnapshot.current!.get(s.studentId) !== snap.get(s.studentId));
          if (changed.length > 0) {
            changed.forEach((s) => changedIds.current.add(s.studentId));
            bumpChanged((n) => n + 1);
            setTimeout(() => {
              changed.forEach((s) => changedIds.current.delete(s.studentId));
              bumpChanged((n) => n + 1);
            }, 6000);
            if (silent) {
              const fresh = changed.filter((s) => !prevSnapshot.current!.has(s.studentId));
              toast(fresh.length > 0 ? `👋 دخل ${fresh.length === 1 ? fresh[0].name : `${fresh.length} طلاب`} إلى الدرس` : `📈 تحديث: ${changed.length === 1 ? changed[0].name : `${changed.length} طلاب`} ${changed.length === 1 ? "تقدّم" : "تقدّموا"}`);
            }
          }
        }
        prevSnapshot.current = snap;
        setData(json);
        setLastUpdated(new Date());
        setLiveState("idle");
      } catch {
        setLiveState("error");
        if (!silent) toast("تعذر تحميل البيانات", "err");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [toast],
  );

  // Auto-refresh every 10s while the reports tab is visible; pauses in hidden tabs; refreshes on focus.
  useEffect(() => {
    if (!authed || !autoRefresh || tab !== "students") return;
    const INTERVAL = 10_000;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void load(true);
      }, INTERVAL);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void load(true);
        start();
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [authed, autoRefresh, tab, load]);

  // Re-render the "x seconds ago" label
  useEffect(() => {
    if (tab !== "students") return;
    const t = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, [tab]);

  const loadRoster = useCallback(async () => {
    try {
      const res = await fetch(`/api/teacher/names?class=${encodeURIComponent(FIXED_CLASS)}`, { cache: "no-store" });
      const json = (await res.json()) as { names: RosterEntry[] };
      setRoster(json.names ?? []);
    } catch {
      toast("تعذر تحميل القائمة", "err");
    }
  }, [toast]);

  const loadDiag = useCallback(async () => {
    setDiag(null);
    try {
      const res = await fetch("/api/progress?diagnose=true", { cache: "no-store" });
      setDiag((await res.json()) as Record<string, unknown>);
    } catch (e) {
      setDiag({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void load();
    void loadRoster();
  }, [authed, load, loadRoster]);

  useEffect(() => {
    if (authed && tab === "diagnose") void loadDiag();
  }, [authed, tab, loadDiag]);

  const students = useMemo(() => {
    const list = (data?.students ?? []).filter((s) => !search || s.name.includes(search.trim()));
    const by: Record<typeof sort, (a: ProgressRecord, b: ProgressRecord) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "ar"),
      progress: (a, b) => pct(b) - pct(a),
      quiz: (a, b) => (quizPct(b) ?? -1) - (quizPct(a) ?? -1),
      recent: (a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
    };
    return [...list].sort(by[sort]);
  }, [data, search, sort]);

  const summary = useMemo(() => {
    const all = data?.students ?? [];
    const quiz = all.filter((s) => quizPct(s) !== null);
    return {
      total: all.length,
      completed: all.filter((s) => s.completed).length,
      avgProgress: all.length ? Math.round(all.reduce((a, s) => a + pct(s), 0) / all.length) : 0,
      avgQuiz: quiz.length ? Math.round(quiz.reduce((a, s) => a + (quizPct(s) ?? 0), 0) / quiz.length) : null,
    };
  }, [data]);

  if (!authed) return <PinGate onOk={() => setAuthed(true)} />;

  /* --------------------------- actions --------------------------- */
  const openReport = (studentId?: string) => router.push(studentId ? `/teacher/report?studentId=${encodeURIComponent(studentId)}` : "/teacher/report?details=1");
  const removeStudent = async (s: ProgressRecord) => {
    if (!confirm(`حذف سجل الطالب «${s.name}»؟`)) return;
    try {
      await teacherFetch(`/api/progress?studentId=${encodeURIComponent(s.studentId)}`, { method: "DELETE" });
      toast("تم الحذف");
      void load();
      void loadRoster();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الحذف", "err");
    }
  };
  const removeClass = async () => {
    if (!confirm(`حذف جميع سجلات فصل ${FIXED_CLASS_LABEL}؟ لا يمكن التراجع.`)) return;
    try {
      const r = await teacherFetch<{ deleted: number }>(`/api/progress?class=${encodeURIComponent(FIXED_CLASS)}`, { method: "DELETE" });
      toast(`تم حذف ${r.deleted} سجل`);
      void load();
      void loadRoster();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الحذف", "err");
    }
  };
  const saveEdit = async (form: { name: string; currentSlide: number; lock: boolean; resetActivities: boolean; quizScore: string }) => {
    if (!edit) return;
    try {
      const body: Record<string, unknown> = { studentId: edit.studentId, name: form.name, currentSlide: form.currentSlide, lock: form.lock };
      if (form.resetActivities) {
        body.resetActivities = true;
        body.maxSlide = form.currentSlide;
        body.completed = false;
        body.quizScore = null;
        body.quizTotal = null;
      } else if (form.quizScore !== "" && edit.quizTotal) {
        body.quizScore = Number(form.quizScore);
      }
      await teacherFetch("/api/progress", { method: "PATCH", body: JSON.stringify(body) });
      toast("تم حفظ التعديلات ✓");
      setEdit(null);
      void load();
      void loadRoster();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الحفظ", "err");
    }
  };
  const addRoster = async () => {
    try {
      const r = await teacherFetch<{ inserted: string[]; skipped: string[] }>("/api/teacher/names", {
        method: "POST",
        body: JSON.stringify({ className: FIXED_CLASS, names: rosterNames }),
      });
      toast(`أُضيف ${r.inserted.length} اسم${r.skipped.length ? ` (تم تخطي ${r.skipped.length} مكرر)` : ""}`);
      setRosterNames("");
      void loadRoster();
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الإضافة", "err");
    }
  };
  const removeRoster = async (entry: RosterEntry) => {
    try {
      await teacherFetch(`/api/teacher/names?studentId=${encodeURIComponent(entry.studentId)}`, { method: "DELETE" });
      toast("تم الحذف");
      void loadRoster();
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الحذف", "err");
    }
  };
  const toggleLock = async (entry: RosterEntry) => {
    try {
      await teacherFetch("/api/teacher/names", { method: "PATCH", body: JSON.stringify({ studentId: entry.studentId, locked: !entry.locked }) });
      void loadRoster();
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل التحديث", "err");
    }
  };
  const exportCsv = () => {
    const blob = new Blob([toCsv(students)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lesson-report-6B.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen">
      {Toast}
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-maroon text-xl text-white">👩‍🏫</span>
            <div>
              <p className="font-heading font-extrabold leading-tight text-maroon">لوحة تحكم المعلم</p>
              <p className="text-[11px] text-ink/50">{FIXED_CLASS_FULL}</p>
            </div>
          </Link>
          <span className="chip bg-navy text-white">فصل {FIXED_CLASS_LABEL}</span>
          <button className="btn-ghost ms-auto px-3 py-2 text-sm" onClick={() => { setTeacherPin(null); setAuthed(false); }}>
            🚪 خروج
          </button>
          <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-sand p-1 sm:w-auto">
            {(
              [
                ["students", "📊 التقارير"],
                ["roster", "📋 قائمة الطلاب"],
                ["sounds", "🔊 الأصوات"],
                ["diagnose", "🩺 التشخيص"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={cx("whitespace-nowrap rounded-xl px-3 py-2 font-heading text-sm font-bold transition", tab === id ? "bg-maroon text-white" : "text-ink/60 hover:bg-white")}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-5 sm:px-6">
        {/* ------------------------------ Students ------------------------------ */}
        {tab === "students" && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              {[
                { label: "عدد الطلاب", value: summary.total, icon: "👥", color: "text-navy" },
                { label: "أكملوا الدرس", value: summary.completed, icon: "🎓", color: "text-saudi" },
                { label: "متوسط التقدم", value: `${summary.avgProgress}%`, icon: "📈", color: "text-gold" },
                { label: "متوسط الاختبار", value: summary.avgQuiz !== null ? `${summary.avgQuiz}%` : "—", icon: "🏆", color: "text-maroon" },
              ].map((c) => (
                <div key={c.label} className="card flex items-center gap-3 p-3 sm:p-4">
                  <span className="text-2xl sm:text-3xl">{c.icon}</span>
                  <div>
                    <p className="text-xs text-ink/50">{c.label}</p>
                    <p className={cx("font-heading text-xl font-black sm:text-2xl", c.color)}>{c.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="card flex flex-wrap items-center gap-2 p-3">
              <input className="input w-full py-2 sm:w-56" placeholder="🔍 بحث بالاسم" value={search} onChange={(e) => setSearch(e.target.value)} />
              <select className="input w-auto py-2" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="name">ترتيب: الاسم</option>
                <option value="progress">ترتيب: التقدم</option>
                <option value="quiz">ترتيب: درجة الاختبار</option>
                <option value="recent">ترتيب: آخر نشاط</option>
              </select>
              <div className="flex w-full flex-wrap items-center gap-2 sm:ms-auto sm:w-auto">
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={cx("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ring-1 transition", autoRefresh ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-sand text-ink/60 ring-sand-dark")}
                  title={autoRefresh ? "إيقاف التحديث التلقائي" : "تشغيل التحديث التلقائي"}
                >
                  <span className="relative flex h-2.5 w-2.5">
                    {autoRefresh && liveState !== "error" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
                    <span className={cx("relative inline-flex h-2.5 w-2.5 rounded-full", liveState === "error" ? "bg-rose-500" : autoRefresh ? "bg-emerald-500" : "bg-ink/30")} />
                  </span>
                  {autoRefresh ? (liveState === "syncing" ? "جارٍ التحديث…" : liveState === "error" ? "تعذر التحديث" : "تحديث تلقائي مباشر") : "التحديث التلقائي متوقف"}
                  {lastUpdated && <span className="hidden text-xs font-normal text-ink/50 sm:inline">· آخر تحديث قبل {Math.max(0, Math.round((Date.now() - lastUpdated.getTime()) / 1000))} ث</span>}
                </button>
                <button className="btn-maroon py-2 text-base" onClick={() => openReport()} disabled={!students.length}>
                  📄 تقرير PDF للفصل
                </button>
                <button className="btn-secondary py-2 text-sm" onClick={() => void load()} disabled={loading}>
                  {loading ? "⏳" : "🔄"} تحديث الآن
                </button>
                <button className="btn-secondary py-2 text-sm" onClick={exportCsv} disabled={!students.length}>
                  ⬇️ CSV
                </button>
                <button className="btn-ghost py-2 text-sm text-rose-700" onClick={removeClass} disabled={!students.length}>
                  🗑️ حذف الكل
                </button>
              </div>
            </div>

            {students.length === 0 && (
              <div className="card p-10 text-center text-lg text-ink/50">{loading ? "جارٍ التحميل..." : "لا توجد سجلات بعد. عندما يدخل الطلاب إلى الدرس ستظهر بياناتهم هنا."}</div>
            )}

            {/* Mobile cards */}
            <div className="grid gap-2 md:hidden">
              {students.map((s) => (
                <div key={s.studentId} className={cx("card p-3 transition-shadow", changedIds.current.has(s.studentId) && "ring-2 ring-gold shadow-gold/30")}>
                  <div className="flex items-center gap-2">
                    <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold text-white", s.completed ? "bg-saudi" : "bg-navy")}>{s.name.slice(0, 1)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-bold">
                        {s.name} {s.locked && "🔒"}
                      </p>
                      <p className="text-xs text-ink/50">
                        الشريحة {s.currentSlide + 1}/{TOTAL_SLIDES} — {doneCount(s)} نشاط — {formatDate(s.lastSeenAt)}
                      </p>
                    </div>
                    {s.completed && <span title="أكمل الدرس">🎓</span>}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sand-dark">
                      <div className={cx("h-full rounded-full", s.completed ? "bg-saudi" : "bg-gold")} style={{ width: `${pct(s)}%` }} />
                    </div>
                    <span className="text-xs font-bold">{pct(s)}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <QuizChip s={s} />
                    <div className="flex gap-1">
                      <button className="btn-ghost px-2 py-1" title="تقرير PDF" onClick={() => openReport(s.studentId)}>📄</button>
                      <button className="btn-ghost px-2 py-1" title="التفاصيل" onClick={() => setDetail(s)}>👁️</button>
                      <button className="btn-ghost px-2 py-1" title="تعديل" onClick={() => setEdit(s)}>✏️</button>
                      <button className="btn-ghost px-2 py-1 text-rose-700" title="حذف" onClick={() => removeStudent(s)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            {students.length > 0 && (
              <div className="card hidden overflow-hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead className="bg-sand text-ink/70">
                      <tr>
                        {["الطالب", "التقدم", "الشريحة الحالية", "الاختبار", "الأنشطة", "آخر ظهور", "إجراءات"].map((h) => (
                          <th key={h} className="px-3 py-3 text-start font-heading font-bold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.studentId} className={cx("border-t border-black/5 transition-colors hover:bg-sand/40", changedIds.current.has(s.studentId) && "bg-gold-light/70")}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={cx("flex h-9 w-9 items-center justify-center rounded-full font-heading font-bold text-white", s.completed ? "bg-saudi" : "bg-navy")}>{s.name.slice(0, 1)}</span>
                              <div>
                                <p className="text-base font-bold">
                                  {s.name} {s.locked && <span title="مثبت من المعلم">🔒</span>}
                                  {currentRound(s) > 1 && <span className="chip ms-1 bg-maroon-light text-maroon" title="عدد مرات بدء الدرس">🔁 المحاولة {currentRound(s)}</span>}
                                </p>
                                <p className="text-[11px] text-ink/40">{s.studentId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-28 overflow-hidden rounded-full bg-sand-dark">
                                <div className={cx("h-full rounded-full", s.completed ? "bg-saudi" : "bg-gold")} style={{ width: `${pct(s)}%` }} />
                              </div>
                              <span className="text-xs font-bold">{pct(s)}%</span>
                              {s.completed && <span title="أكمل الدرس">🎓</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <span className="font-bold">{s.currentSlide + 1}</span>/{TOTAL_SLIDES} — {SLIDES[s.currentSlide]?.title}
                          </td>
                          <td className="px-3 py-2"><QuizChip s={s} /></td>
                          <td className="px-3 py-2 text-xs">{doneCount(s)}/{TOTAL_SLIDES}</td>
                          <td className="px-3 py-2 text-xs text-ink/60">{formatDate(s.lastSeenAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button className="btn-ghost px-2 py-1" title="تقرير PDF" onClick={() => openReport(s.studentId)}>📄</button>
                              <button className="btn-ghost px-2 py-1" title="التفاصيل" onClick={() => setDetail(s)}>👁️</button>
                              <button className="btn-ghost px-2 py-1" title="تعديل" onClick={() => setEdit(s)}>✏️</button>
                              <button className="btn-ghost px-2 py-1 text-rose-700" title="حذف" onClick={() => removeStudent(s)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------- Roster ------------------------------- */}
        {tab === "roster" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-1">
              <h3 className="font-heading text-lg font-black text-saudi">➕ إضافة أسماء طلاب فصل {FIXED_CLASS_LABEL}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink/60">
                الأسماء المسجلة هنا تظهر للطالب في قائمة الاختيار وتُثبَّت له فلا يستطيع تغييرها. لا يمكن تكرار الاسم نفسه مرتين.
              </p>
              <label className="mt-3 block text-sm font-bold">الأسماء (اسم في كل سطر)</label>
              <textarea className="input" rows={8} value={rosterNames} onChange={(e) => setRosterNames(e.target.value)} placeholder={"محمد أحمد العتيبي\nفهد سعد القحطاني\n..."} />
              <button className="btn-primary mt-3 w-full text-lg" onClick={addRoster} disabled={!rosterNames.trim()}>
                حفظ الأسماء
              </button>
            </div>
            <div className="card p-4 lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-heading text-lg font-extrabold text-navy">
                  قائمة فصل {FIXED_CLASS_LABEL} <span className="text-sm text-ink/50">({roster.length} طالب — {roster.filter((r) => r.claimed).length} سجّلوا دخولهم)</span>
                </h4>
                {roster.length > 0 && (
                  <button
                    className="btn-ghost px-2 py-1 text-sm text-rose-700"
                    onClick={async () => {
                      if (!confirm(`حذف قائمة فصل ${FIXED_CLASS_LABEL} كاملة؟`)) return;
                      await teacherFetch(`/api/teacher/names?class=${encodeURIComponent(FIXED_CLASS)}`, { method: "DELETE" });
                      void loadRoster();
                      void load();
                    }}
                  >
                    🗑️ حذف القائمة
                  </button>
                )}
              </div>
              {roster.length === 0 && <p className="p-6 text-center text-ink/50">لا توجد أسماء بعد.</p>}
              <ul className="grid gap-1 sm:grid-cols-2">
                {roster.map((e) => (
                  <li key={e.studentId} className="flex items-center justify-between gap-2 rounded-xl bg-sand/60 px-3 py-2">
                    <span className="min-w-0 truncate text-base font-bold">
                      {e.locked ? "🔒" : "🔓"} {e.name} {e.claimed && <span className="chip bg-emerald-50 text-emerald-700">مسجل ✓</span>}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <button className="btn-ghost px-2 py-0.5 text-xs" onClick={() => toggleLock(e)}>
                        {e.locked ? "إلغاء التثبيت" : "تثبيت"}
                      </button>
                      <button className="btn-ghost px-2 py-0.5 text-xs text-rose-700" onClick={() => removeRoster(e)}>
                        حذف
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ------------------------------- Sounds ------------------------------- */}
        {tab === "sounds" && <SoundsManager toast={toast} />}

        {/* ------------------------------ Diagnose ------------------------------ */}
        {tab === "diagnose" && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-heading text-xl font-black text-saudi">🩺 الوضع التشخيصي</h3>
                <p className="text-sm text-ink/60">
                  نتيجة <code>GET /api/progress?diagnose=true</code> — فحص الاتصال بقاعدة البيانات والجداول وبيئة التشغيل.
                </p>
              </div>
              <button className="btn-secondary py-2 text-sm" onClick={() => void loadDiag()}>
                🔄 إعادة الفحص
              </button>
            </div>
            {!diag ? (
              <div className="card p-8 text-center text-ink/50">جارٍ الفحص...</div>
            ) : (
              <>
                {(() => {
                  const problems = (diag.problems as string[] | undefined) ?? [];
                  const wt = (diag.writeTest as { ok?: boolean; step?: string | null; error?: string; code?: string; detail?: string; hint?: string; latencyMs?: number; skipped?: string } | undefined) ?? {};
                  const schema = (diag.schema as { ok?: boolean; missingCritical?: string[]; missingOptional?: string[]; provisioned?: boolean } | undefined) ?? {};
                  const dbInfo = (diag.database as { connected?: boolean; latencyMs?: number; host?: string; ssl?: string; pooler?: boolean; error?: string } | undefined) ?? {};
                  return (
                    <>
                      <div className={cx("rounded-3xl p-4 ring-2", diag.ok ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200")}>
                        <p className={cx("font-heading text-lg font-extrabold", diag.ok ? "text-emerald-800" : "text-rose-800")}>
                          {diag.ok ? "✅" : "❌"} {String(diag.summary ?? (diag.ok ? "سليم" : "توجد مشكلة"))}
                        </p>
                        {problems.length > 0 && (
                          <ul className="mt-2 list-inside list-disc space-y-1 text-base leading-relaxed">
                            {problems.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        )}
                        <p className="mt-2 text-xs text-ink/60">
                          المضيف: <span dir="ltr">{dbInfo.host ?? "—"}</span> — SSL: {dbInfo.ssl ?? "—"} — Pooler: {dbInfo.pooler ? "نعم" : "لا"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <DiagCard label="الحالة العامة" ok={Boolean(diag.ok)} value={diag.ok ? "سليم" : "توجد مشكلة"} />
                        <DiagCard label="الاتصال بقاعدة البيانات" ok={Boolean(dbInfo.connected)} value={dbInfo.connected ? `${dbInfo.latencyMs ?? "—"} ms` : dbInfo.error ?? "فشل"} />
                        <DiagCard label="الجداول والقيود" ok={Boolean(schema.ok)} value={schema.ok ? (schema.missingOptional?.length ? "مكتملة (تحذيرات)" : "مكتملة") : `ناقصة: ${schema.missingCritical?.length ?? "؟"}`} />
                        <DiagCard label="اختبار الكتابة (إنشاء سجل طالب)" ok={Boolean(wt.ok)} value={wt.ok ? `نجح (${wt.latencyMs ?? "—"} ms)` : wt.skipped ? "لم يُنفَّذ" : `فشل عند: ${wt.step ?? "—"}`} />
                        {Object.entries((diag.tables as Record<string, { exists?: boolean; rows?: number }>) ?? {}).map(([name, t]) => (
                          <DiagCard key={name} label={name} ok={Boolean(t.exists)} value={t.exists ? `${t.rows ?? 0} صف` : "غير موجود"} />
                        ))}
                      </div>
                      {!wt.ok && wt.error && (
                        <div className="card p-4 ring-2 ring-rose-200">
                          <p className="font-heading font-extrabold text-rose-800">تفاصيل فشل اختبار الكتابة</p>
                          <p className="mt-1 text-base">{wt.error}</p>
                          {wt.hint && <p className="mt-1 text-sm text-ink/70">💡 {wt.hint}</p>}
                          <p dir="ltr" className="mt-2 break-all rounded-xl bg-sand p-2 text-left font-mono text-xs">
                            [{wt.code}] {wt.detail}
                          </p>
                          <a className="btn-secondary mt-3 py-2 text-sm" href="/api/setup" target="_blank" rel="noreferrer">
                            🛠️ تشغيل الإصلاح التلقائي (/api/setup)
                          </a>
                        </div>
                      )}
                    </>
                  );
                })()}
                <pre dir="ltr" className="card max-h-[60vh] overflow-auto p-4 text-left text-xs leading-relaxed">
                  {JSON.stringify(diag, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </main>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `تفاصيل: ${detail.name}` : ""}>
        {detail && (
          <>
            <StudentDetail s={detail} />
            <button className="btn-maroon mt-4 w-full" onClick={() => openReport(detail.studentId)}>
              📄 فتح تقرير PDF لهذا الطالب
            </button>
          </>
        )}
      </Modal>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? `تعديل بيانات: ${edit.name}` : ""}>
        {edit && <EditForm s={edit} onSave={saveEdit} onCancel={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}

function DiagCard({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className={cx("card flex items-center gap-3 p-4 ring-2", ok ? "ring-emerald-200" : "ring-rose-200")}>
      <span className="text-2xl">{ok ? "✅" : "❌"}</span>
      <div className="min-w-0">
        <p className="text-xs text-ink/50">{label}</p>
        <p className="truncate font-heading font-extrabold">{value}</p>
      </div>
    </div>
  );
}

function AttemptsTable({ attempts }: { attempts: Attempt[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl ring-1 ring-black/10">
      <table className="w-full text-sm">
        <thead className="bg-sand text-ink/70">
          <tr>
            {["المحاولة", "التقدم", "الاختبار", "محاولات الاختبار", "الحالة", "البداية", "النهاية"].map((h) => (
              <th key={h} className="px-2 py-2 text-start font-heading font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const p = a.quizScore !== null && a.quizTotal ? Math.round((a.quizScore / a.quizTotal) * 100) : null;
            return (
              <tr key={a.round} className={cx("border-t border-black/5", a.current && "bg-saudi-light/50")}>
                <td className="px-2 py-1.5 font-bold">
                  {a.round} {a.current && <span className="chip bg-saudi text-white">الحالية</span>}
                </td>
                <td className="px-2 py-1.5">{Math.round(((a.maxSlide + 1) / TOTAL_SLIDES) * 100)}% (الشريحة {a.maxSlide + 1})</td>
                <td className="px-2 py-1.5">{p === null ? <span className="text-ink/40">لم يختبر</span> : <span className={cx("chip", pctClass(p))}>{a.quizScore}/{a.quizTotal} ({p}%)</span>}</td>
                <td className="px-2 py-1.5 text-center">{a.quizAttempts}</td>
                <td className="px-2 py-1.5">{a.completed ? "🎓 مكتملة" : "⏳ غير مكتملة"}</td>
                <td className="px-2 py-1.5 text-xs text-ink/60">{formatDate(a.startedAt)}</td>
                <td className="px-2 py-1.5 text-xs text-ink/60">{a.finishedAt ? formatDate(a.finishedAt) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StudentDetail({ s: full }: { s: ProgressRecord }) {
  const attempts = allAttempts(full);
  const [round, setRound] = useState(attempts.length);
  const attempt = attempts[Math.min(round, attempts.length) - 1] ?? attempts[attempts.length - 1];
  const s = attemptAsRecord(full, attempt);
  const tf = act<{ score?: number; total?: number }>(s, "truefalse");
  const quizHistory = (act<{ history?: Array<{ score: number; total: number; at: string }> }>(s, "quiz").history ?? []).slice(-5);
  const summary = summarizeActivities(s);
  const qp = quizPct(s);
  const best = bestQuizPercent(full);
  return (
    <div className="grid gap-4 text-sm">
      {attempts.length > 1 && (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-heading font-extrabold text-maroon">🔁 المحاولات ({attempts.length}) — أفضل نتيجة اختبار: {best === null ? "—" : `${best}%`}</h4>
            <div className="flex flex-wrap gap-1 rounded-2xl bg-sand p-1">
              {attempts.map((a) => (
                <button key={a.round} type="button" onClick={() => setRound(a.round)} className={cx("rounded-xl px-3 py-1.5 font-heading text-sm font-bold transition", round === a.round ? "bg-maroon text-white" : "text-ink/60 hover:bg-white")}>
                  المحاولة {a.round}{a.current ? " (الحالية)" : ""}
                </button>
              ))}
            </div>
          </div>
          <AttemptsTable attempts={attempts} />
          <p className="text-xs text-ink/50">التفاصيل أدناه تخص المحاولة {attempt.round}{attempt.current ? " (الحالية)" : ""}؛ اختر محاولة أخرى من الأزرار أعلاه.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-sand/60 p-3">
        <div className="relative">
          <ProgressRing percent={pct(s)} size={70} />
          <span className="absolute inset-0 flex items-center justify-center font-heading text-sm font-black">{pct(s)}%</span>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          <Info label="الشريحة الحالية" value={`${s.currentSlide + 1} — ${SLIDES[s.currentSlide]?.title ?? ""}`} />
          <Info label="أقصى شريحة" value={`${s.maxSlide + 1}/${TOTAL_SLIDES}`} />
          <Info label="الاختبار الختامي" value={qp === null ? "لم يختبر" : `${s.quizScore}/${s.quizTotal} (${qp}%)`} />
          <Info label="صواب/خطأ" value={tf.score !== undefined ? `${tf.score}/${tf.total}` : "—"} />
          <Info label="أول دخول" value={formatDate(s.createdAt)} />
          <Info label="آخر ظهور" value={formatDate(s.lastSeenAt)} />
        </div>
      </div>
      <div>
        <h4 className="mb-2 font-heading font-extrabold text-saudi">الأنشطة المكتملة ({doneCount(s)}/{TOTAL_SLIDES})</h4>
        <div className="flex flex-wrap gap-1">
          {SLIDES.map((sl, i) => {
            const d = (s.activities?.[sl.id] as { done?: boolean } | undefined)?.done;
            return (
              <span key={sl.id} title={sl.title} className={cx("chip text-xs", d ? "bg-emerald-50 text-emerald-700" : "bg-sand text-ink/40")}>
                {i + 1} {sl.icon}
              </span>
            );
          })}
        </div>
      </div>
      {quizHistory.length > 0 && (
        <div>
          <h4 className="mb-1 font-heading font-extrabold text-saudi">سجل محاولات الاختبار</h4>
          <ul className="flex flex-wrap gap-2">
            {quizHistory.map((h, i) => (
              <li key={i} className="chip bg-navy-light text-navy">
                {h.score}/{h.total} — {formatDate(h.at)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-2 font-heading font-extrabold text-saudi">إجابات الطالب في الأنشطة</h4>
        {summary.length === 0 ? (
          <p className="text-ink/50">لم يُجب الطالب عن أنشطة الاختيار بعد.</p>
        ) : (
          <div className="grid gap-2">
            {summary.map((item) => (
              <Answer key={item.title} title={item.title} text={item.lines.join("\n")} tone={item.tone} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink/50">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function Answer({ title, text, tone = "neutral" }: { title: string; text?: string; tone?: "ok" | "bad" | "neutral" }) {
  if (!text?.trim()) return null;
  return (
    <div className={cx("rounded-2xl border p-3", tone === "ok" ? "border-emerald-200 bg-emerald-50/60" : tone === "bad" ? "border-rose-200 bg-rose-50/60" : "border-black/5 bg-white")}>
      <p className="mb-1 text-xs font-bold text-maroon">{title}</p>
      <p className="whitespace-pre-wrap text-base leading-relaxed">{text}</p>
    </div>
  );
}

function EditForm({
  s,
  onSave,
  onCancel,
}: {
  s: ProgressRecord;
  onSave: (f: { name: string; currentSlide: number; lock: boolean; resetActivities: boolean; quizScore: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(s.name);
  const [currentSlide, setCurrentSlide] = useState(s.currentSlide);
  const [lock, setLock] = useState<boolean>(true);
  const [resetActivities, setReset] = useState(false);
  const [quizScore, setQuizScore] = useState(s.quizScore === null ? "" : String(s.quizScore));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, currentSlide, lock, resetActivities, quizScore });
      }}
    >
      <label className="grid gap-1 text-sm font-bold">
        الاسم <span className="text-xs font-normal text-ink/50">(لا يمكن تكرار اسم موجود في الفصل)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <p className="text-sm text-ink/60">الفصل: {FIXED_CLASS_LABEL} (ثابت)</p>
      <label className="grid gap-1 text-sm font-bold">
        الشريحة الحالية
        <select className="input" value={currentSlide} onChange={(e) => setCurrentSlide(Number(e.target.value))}>
          {SLIDES.map((sl, i) => (
            <option key={sl.id} value={i}>
              {i + 1}. {sl.title}
            </option>
          ))}
        </select>
      </label>
      {s.quizTotal ? (
        <label className="grid gap-1 text-sm font-bold">
          درجة الاختبار (من {s.quizTotal})
          <input className="input" type="number" min={0} max={s.quizTotal} value={quizScore} onChange={(e) => setQuizScore(e.target.value)} />
        </label>
      ) : null}
      <label className="flex items-center gap-2 rounded-2xl bg-saudi-light p-3 text-sm">
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-5 w-5 accent-saudi" />
        🔒 تثبيت الاسم (يمنع الطالب من تغييره لاحقاً)
      </label>
      <label className="flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-sm">
        <input type="checkbox" checked={resetActivities} onChange={(e) => setReset(e.target.checked)} className="h-5 w-5 accent-rose-600" />
        ♻️ إعادة ضبط الأنشطة والاختبار (يبدأ الطالب من جديد)
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          إلغاء
        </button>
        <button type="submit" className="btn-primary">
          حفظ
        </button>
      </div>
    </form>
  );
}
