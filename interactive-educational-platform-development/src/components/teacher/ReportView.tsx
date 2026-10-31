"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LESSON_TITLE, QUIZ, SLIDES, TOTAL_SLIDES } from "@/lib/lesson-content";
import { summarizeActivities } from "@/lib/activity-summary";
import { allAttempts, attemptAsRecord, bestAttemptRecord, bestQuizPercent, formatDuration, timeSpentSeconds } from "@/lib/attempts";
import { FIXED_CLASS, FIXED_CLASS_FULL, FIXED_CLASS_LABEL } from "@/lib/config";
import { formatDate, getTeacherPin, type ProgressRecord } from "@/lib/client-api";
import { cx } from "@/components/ui";

/* ------------------------------- helpers ------------------------------- */
const pct = (s: ProgressRecord) => Math.round(((s.maxSlide + 1) / TOTAL_SLIDES) * 100);
const quizPct = (s: ProgressRecord) => (s.quizScore !== null && s.quizTotal ? Math.round((s.quizScore / s.quizTotal) * 100) : null);
const isDone = (s: ProgressRecord, id: string) => Boolean((s.activities?.[id] as { done?: boolean } | undefined)?.done);
const doneCount = (s: ProgressRecord) => SLIDES.filter((sl) => isDone(s, sl.id)).length;
function act<T>(s: ProgressRecord, id: string): T {
  return (s.activities?.[id] as T) ?? ({} as T);
}
function grade(p: number | null) {
  if (p === null) return { label: "لم يختبر", color: "#6b7280", bg: "#f3f4f6" };
  if (p >= 90) return { label: "ممتاز", color: "#047857", bg: "#d1fae5" };
  if (p >= 80) return { label: "جيد جداً", color: "#0f6e56", bg: "#e3f3ee" };
  if (p >= 60) return { label: "جيد", color: "#b45309", bg: "#fef3c7" };
  return { label: "يحتاج دعماً", color: "#be123c", bg: "#ffe4e6" };
}
const todayLong = () => new Intl.DateTimeFormat("ar-SA", { dateStyle: "full" }).format(new Date());

/* ------------------------------ sub-blocks ------------------------------ */
function ReportHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-saudi to-saudi-dark p-5 text-white">
      <div className="absolute -left-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <div className="absolute -bottom-12 right-1/3 h-32 w-32 rounded-full bg-gold/20" />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wide text-gold">المملكة العربية السعودية — وزارة التعليم — الدراسات الاجتماعية</p>
          <h1 className="mt-1 font-heading text-2xl font-black leading-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-white/90">
            درس: {LESSON_TITLE} — الوحدة الثالثة — الدرس الثامن
          </p>
          <p className="text-sm text-white/90">{subtitle}</p>
        </div>
        <div className="shrink-0 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-4xl ring-1 ring-white/30">🏰</div>
          <p className="mt-1 text-[11px] text-white/80">{todayLong()}</p>
        </div>
      </div>
    </header>
  );
}

function Kpi({ label, value, icon, color = "#0f6e56" }: { label: string; value: string | number; icon: string; color?: string }) {
  return (
    <div className="break-inside-avoid rounded-2xl bg-white p-3 ring-1 ring-black/10">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11px] text-ink/50">{label}</p>
          <p className="truncate font-heading text-xl font-black" style={{ color }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function Bar({ value, color = "#0f6e56" }: { value: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sand-dark">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function ReportFooter({ page }: { page?: string }) {
  return (
    <div className="mt-5 flex items-center justify-between border-t border-dashed border-black/15 pt-2 text-[10px] text-ink/50">
      <span>منصة الدرس التفاعلي — تقرير آلي من قاعدة البيانات</span>
      <span>{page}</span>
      <span>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</span>
    </div>
  );
}

/* ------------------------------ class report ------------------------------ */
function ClassReport({ students, bestOnly }: { students: ProgressRecord[]; bestOnly: boolean }) {
  const tested = students.filter((s) => quizPct(s) !== null);
  const avgQuiz = tested.length ? Math.round(tested.reduce((a, s) => a + (quizPct(s) ?? 0), 0) / tested.length) : null;
  const avgProgress = students.length ? Math.round(students.reduce((a, s) => a + pct(s), 0) / students.length) : 0;
  const completed = students.filter((s) => s.completed).length;
  const top = [...tested].sort((a, b) => (quizPct(b) ?? 0) - (quizPct(a) ?? 0)).slice(0, 3);
  const support = tested.filter((s) => (quizPct(s) ?? 0) < 60);
  const notTested = students.filter((s) => quizPct(s) === null);
  const buckets = [
    { label: "ممتاز (90% فأكثر)", color: "#047857", n: tested.filter((s) => (quizPct(s) ?? 0) >= 90).length },
    { label: "جيد جداً (80–89%)", color: "#0f6e56", n: tested.filter((s) => (quizPct(s) ?? 0) >= 80 && (quizPct(s) ?? 0) < 90).length },
    { label: "جيد (60–79%)", color: "#b45309", n: tested.filter((s) => (quizPct(s) ?? 0) >= 60 && (quizPct(s) ?? 0) < 80).length },
    { label: "يحتاج دعماً (أقل من 60%)", color: "#be123c", n: support.length },
    { label: "لم يختبر بعد", color: "#6b7280", n: notTested.length },
  ];
  const ranked = [...students].sort((a, b) => (quizPct(b) ?? -1) - (quizPct(a) ?? -1) || pct(b) - pct(a) || a.name.localeCompare(b.name, "ar"));

  // Per-slide completion rate (which activities were hardest)
  const slideRates = SLIDES.map((sl) => ({ ...sl, rate: students.length ? Math.round((students.filter((s) => isDone(s, sl.id)).length / students.length) * 100) : 0 }));
  const hardest = [...slideRates].sort((a, b) => a.rate - b.rate).slice(0, 3);

  return (
    <section className="report-sheet break-after-page rounded-3xl bg-white p-5 shadow-xl ring-1 ring-black/5 sm:p-7">
      <ReportHeader title="تقرير أداء الطلاب" subtitle={`${FIXED_CLASS_FULL} — فصل ${FIXED_CLASS_LABEL} — عدد الطلاب: ${students.length}${bestOnly ? " — (تُعرض المحاولة الأفضل لكل طالب)" : ""}`} />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Kpi label="عدد الطلاب" value={students.length} icon="👥" color="#2f4b6e" />
        <Kpi label="أكملوا الدرس" value={`${completed} (${students.length ? Math.round((completed / students.length) * 100) : 0}%)`} icon="🎓" />
        <Kpi label="متوسط التقدم" value={`${avgProgress}%`} icon="📈" color="#b45309" />
        <Kpi label="متوسط الاختبار" value={avgQuiz !== null ? `${avgQuiz}%` : "—"} icon="🏆" color="#a0353f" />
        <Kpi label="اختبروا / لم يختبروا" value={`${tested.length} / ${notTested.length}`} icon="📝" color="#6b7280" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="break-inside-avoid rounded-2xl bg-sand/60 p-4 ring-1 ring-black/5">
          <h3 className="mb-2 font-heading text-base font-extrabold text-saudi">📊 توزيع مستويات الاختبار الختامي</h3>
          <ul className="grid gap-2">
            {buckets.map((b) => (
              <li key={b.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span className="font-bold" style={{ color: b.color }}>{b.label}</span>
                    <span className="text-ink/60">{b.n} طالب</span>
                  </div>
                  <Bar value={students.length ? (b.n / students.length) * 100 : 0} color={b.color} />
                </div>
                <span className="w-10 text-end text-xs font-bold text-ink/60">{students.length ? Math.round((b.n / students.length) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3">
          <div className="break-inside-avoid rounded-2xl bg-gold-light/70 p-4 ring-1 ring-gold/40">
            <h3 className="mb-1 font-heading text-base font-extrabold text-amber-900">🥇 المتفوقون</h3>
            {top.length === 0 ? (
              <p className="text-sm text-ink/50">لا توجد نتائج اختبار بعد.</p>
            ) : (
              <ol className="grid gap-1 text-sm">
                {top.map((s, i) => (
                  <li key={s.studentId} className="flex items-center justify-between">
                    <span>
                      {["🥇", "🥈", "🥉"][i]} {s.name}
                    </span>
                    <b className="text-saudi">{s.quizScore}/{s.quizTotal} ({quizPct(s)}%)</b>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="break-inside-avoid rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <h3 className="mb-1 font-heading text-base font-extrabold text-rose-800">🤝 بحاجة إلى دعم ومتابعة</h3>
            {support.length === 0 ? <p className="text-sm text-ink/50">لا يوجد طلاب دون 60%.</p> : <p className="text-sm leading-relaxed">{support.map((s) => `${s.name} (${quizPct(s)}%)`).join("، ")}</p>}
          </div>
          <div className="break-inside-avoid rounded-2xl bg-navy-light p-4 ring-1 ring-navy/20">
            <h3 className="mb-1 font-heading text-base font-extrabold text-navy">🧩 أقل الأنشطة إنجازاً</h3>
            <ul className="text-sm">
              {hardest.map((h) => (
                <li key={h.id} className="flex justify-between">
                  <span>{h.icon} {h.title}</span>
                  <b>{h.rate}%</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <h3 className="mb-2 mt-5 font-heading text-lg font-extrabold text-saudi">📋 كشف درجات ومتابعة الطلاب</h3>
      <div className="overflow-hidden rounded-2xl ring-1 ring-black/10">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="bg-saudi text-white">
              {["#", "اسم الطالب", "التقدم", "الشريحة الحالية", "الأنشطة", "الاختبار", "المستوى", "المحاولات", "الحالة", "آخر دخول"].map((h) => (
                <th key={h} className="px-2 py-2 text-start font-heading font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranked.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-ink/50">
                  لا توجد سجلات.
                </td>
              </tr>
            )}
            {ranked.map((s, i) => {
              const qp = quizPct(s);
              const g = grade(qp);
              return (
                <tr key={s.studentId} className={cx("break-inside-avoid border-t border-black/5", i % 2 ? "bg-sand/40" : "bg-white")}>
                  <td className="px-2 py-1.5 text-ink/50">{i + 1}</td>
                  <td className="px-2 py-1.5 font-bold">
                    {s.name} {s.locked && "🔒"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16">
                        <Bar value={pct(s)} color={s.completed ? "#0f6e56" : "#d4a443"} />
                      </div>
                      <span className="font-bold">{pct(s)}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {s.currentSlide + 1}/{TOTAL_SLIDES}
                  </td>
                  <td className="px-2 py-1.5">
                    {doneCount(s)}/{TOTAL_SLIDES}
                  </td>
                  <td className="px-2 py-1.5 font-bold">
                    {(() => {
                      const at = allAttempts(s);
                      const bestRound = (s as ProgressRecord & { __bestRound?: number; __attempts?: number }).__bestRound;
                      const total = (s as ProgressRecord & { __attempts?: number }).__attempts ?? at.length;
                      if (bestOnly) {
                        return (
                          <span>
                            {qp === null ? "—" : `${s.quizScore}/${s.quizTotal} (${qp}%)`}
                            {total > 1 && bestRound && <span className="ms-1 rounded-full bg-gold-light px-1.5 py-0.5 text-[10px] font-bold text-amber-900">⭐ الأفضل (م{bestRound} من {total})</span>}
                          </span>
                        );
                      }
                      if (at.length === 1) return qp === null ? "—" : `${s.quizScore}/${s.quizTotal} (${qp}%)`;
                      return (
                        <span className="flex flex-wrap gap-1">
                          {at.map((a) => (
                            <span key={a.round} className={cx("rounded-full px-1.5 py-0.5 text-[10px]", a.current ? "bg-saudi-light text-saudi" : "bg-sand text-ink/70")}>
                              م{a.round}: {a.quizScore !== null && a.quizTotal ? `${a.quizScore}/${a.quizTotal}` : "—"}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: g.bg, color: g.color }}>
                      {g.label}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">{s.quizAttempts}</td>
                  <td className="px-2 py-1.5">{s.completed ? "🎓 أكمل" : "⏳ قيد التقدم"}</td>
                  <td className="px-2 py-1.5 text-[11px] text-ink/60">{formatDate(s.lastSeenAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
        <div className="break-inside-avoid">
          <p className="mb-6 font-bold">توقيع المعلم/ـة:</p>
          <div className="border-b border-dotted border-black/40" />
        </div>
        <div className="break-inside-avoid">
          <p className="mb-6 font-bold">توقيع مدير/ة المدرسة:</p>
          <div className="border-b border-dotted border-black/40" />
        </div>
      </div>
      <ReportFooter page="تقرير الفصل" />
    </section>
  );
}

/* ----------------------------- student report ----------------------------- */
function Answer({ title, text, tone = "neutral" }: { title: string; text?: string; tone?: "ok" | "bad" | "neutral" }) {
  if (!text?.trim()) return null;
  return (
    <div className={cx("break-inside-avoid rounded-xl border p-2.5", tone === "ok" ? "border-emerald-200 bg-emerald-50" : tone === "bad" ? "border-rose-200 bg-rose-50" : "border-black/10 bg-white")}>
      <p className="mb-0.5 text-[11px] font-bold text-maroon">{title}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </div>
  );
}

function StudentReport({ s, index, bestOnly }: { s: ProgressRecord; index: number; bestOnly: boolean }) {
  const qp = quizPct(s);
  const g = grade(qp);
  const tf = act<{ score?: number; total?: number }>(s, "truefalse");
  const quiz = act<{ answers?: Record<string, string>; history?: Array<{ score: number; total: number; at: string }> }>(s, "quiz");
  const hasQuizAnswers = quiz.answers && Object.keys(quiz.answers).length > 0;
  const summary = summarizeActivities(s);
  const attempts = allAttempts(s);
  const best = bestQuizPercent(s);
  const bestMeta = s as ProgressRecord & { __bestRound?: number; __attempts?: number };

  return (
    <section className="report-sheet break-after-page rounded-3xl bg-white p-5 shadow-xl ring-1 ring-black/5 last:break-after-auto sm:p-7">
      <ReportHeader
        title={`تقرير الطالب: ${s.name}`}
        subtitle={`فصل ${FIXED_CLASS_LABEL} — ${s.completed ? "أكمل الدرس 🎓" : "قيد التقدم"}${s.locked ? " — الاسم مثبت من المعلم 🔒" : ""}${
          bestOnly && (bestMeta.__attempts ?? 1) > 1 ? ` — ⭐ المحاولة الأفضل (رقم ${bestMeta.__bestRound} من ${bestMeta.__attempts})` : ""
        }`}
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="نسبة التقدم" value={`${pct(s)}%`} icon="📈" color="#b45309" />
        <Kpi label="الاختبار الختامي" value={qp === null ? "لم يختبر" : `${s.quizScore}/${s.quizTotal} (${qp}%)`} icon="🏆" color={g.color} />
        <Kpi label="المستوى" value={g.label} icon="🎯" color={g.color} />
        <Kpi label="الأنشطة المكتملة" value={`${doneCount(s)}/${TOTAL_SLIDES}`} icon="✅" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-2xl bg-sand/60 p-3 text-xs sm:grid-cols-4">
        <p><b>الشريحة الحالية:</b> {s.currentSlide + 1} — {SLIDES[s.currentSlide]?.title}</p>
        <p><b>محاولات الاختبار:</b> {s.quizAttempts}</p>
        <p><b>صواب/خطأ:</b> {tf.score !== undefined ? `${tf.score}/${tf.total}` : "—"}</p>
        <p><b>⏱️ زمن المؤقتات:</b> {formatDuration(timeSpentSeconds(s.activities as Record<string, unknown>))}</p>
        <p><b>أول دخول:</b> {formatDate(s.createdAt)}</p>
        <p className="col-span-2"><b>آخر دخول:</b> {formatDate(s.lastSeenAt)}</p>
      </div>

      {!bestOnly && attempts.length > 1 && (
        <div className="mt-3 break-inside-avoid">
          <h3 className="mb-1.5 font-heading text-base font-extrabold text-maroon">
            🔁 مقارنة المحاولات ({attempts.length}) — أفضل نتيجة اختبار: {best === null ? "—" : `${best}%`}
          </h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-black/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-maroon text-white">
                  {["المحاولة", "التقدم", "الاختبار", "صواب/خطأ", "الأنشطة", "الحالة", "البداية", "النهاية"].map((h) => (
                    <th key={h} className="px-2 py-1.5 text-start font-heading font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const rec = attemptAsRecord(s, a);
                  const p = a.quizScore !== null && a.quizTotal ? Math.round((a.quizScore / a.quizTotal) * 100) : null;
                  const g2 = grade(p);
                  const tf2 = act<{ score?: number; total?: number }>(rec, "truefalse");
                  return (
                    <tr key={a.round} className={cx("border-t border-black/5", a.current ? "bg-saudi-light/60" : "bg-white")}>
                      <td className="px-2 py-1.5 font-bold">{a.round}{a.current ? " (الحالية)" : ""}</td>
                      <td className="px-2 py-1.5">{pct(rec)}% (الشريحة {a.maxSlide + 1})</td>
                      <td className="px-2 py-1.5">
                        {p === null ? "لم يختبر" : <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: g2.bg, color: g2.color }}>{a.quizScore}/{a.quizTotal} ({p}%) — {g2.label}</span>}
                      </td>
                      <td className="px-2 py-1.5">{tf2.score !== undefined ? `${tf2.score}/${tf2.total}` : "—"}</td>
                      <td className="px-2 py-1.5">{doneCount(rec)}/{TOTAL_SLIDES}</td>
                      <td className="px-2 py-1.5">{a.completed ? "🎓 مكتملة" : "⏳ غير مكتملة"}</td>
                      <td className="px-2 py-1.5 text-[10px] text-ink/60">{formatDate(a.startedAt)}</td>
                      <td className="px-2 py-1.5 text-[10px] text-ink/60">{a.finishedAt ? formatDate(a.finishedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-ink/50">تفاصيل الأنشطة والاختبار أدناه تخص المحاولة الحالية؛ وتُحفظ إجابات المحاولات السابقة كاملة في قاعدة البيانات.</p>
        </div>
      )}

      <h3 className="mb-1.5 mt-4 font-heading text-base font-extrabold text-saudi">🗂️ خريطة إنجاز الأنشطة</h3>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
        {SLIDES.map((sl, i) => {
          const d = isDone(s, sl.id);
          return (
            <div key={sl.id} className={cx("break-inside-avoid rounded-lg p-1 text-center text-[10px] leading-tight ring-1", d ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-white text-ink/40 ring-black/10")}>
              <div className="text-base">{d ? "✅" : sl.icon}</div>
              {i + 1}. {sl.title}
            </div>
          );
        })}
      </div>

      {(hasQuizAnswers || (quiz.history?.length ?? 0) > 0) && (
        <div className="mt-4 break-inside-avoid">
          <h3 className="mb-1.5 font-heading text-base font-extrabold text-saudi">🏆 تحليل الاختبار الختامي</h3>
          {hasQuizAnswers && (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {QUIZ.map((q, i) => {
                const a = quiz.answers?.[String(i)];
                const answered = a !== undefined;
                const ok = answered && Number(a) === q.answer;
                return (
                  <div key={i} className={cx("flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px] ring-1", !answered ? "bg-white ring-black/10 text-ink/50" : ok ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200")}>
                    <span>{!answered ? "○" : ok ? "✔" : "✘"}</span>
                    <span className="flex-1">
                      {i + 1}. {q.q}
                      {answered && !ok && <span className="block text-emerald-800">الصحيح: {q.options[q.answer]}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {(quiz.history?.length ?? 0) > 0 && (
            <p className="mt-1.5 text-xs text-ink/60">
              سجل المحاولات: {quiz.history!.slice(-5).map((h) => `${h.score}/${h.total}`).join(" ← ")}
            </p>
          )}
        </div>
      )}

      <h3 className="mb-1.5 mt-4 font-heading text-base font-extrabold text-saudi">✍️ إجابات الطالب في الأنشطة (✔ صحيح — ✘ غير صحيح)</h3>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {summary.map((item) => (
          <Answer key={item.title} title={item.title} text={item.lines.join("\n")} tone={item.tone} />
        ))}
        {summary.length === 0 && <p className="text-sm text-ink/50">لم يُجب الطالب عن أنشطة الاختيار بعد.</p>}
      </div>

      <div className="mt-4 break-inside-avoid rounded-2xl border-2 border-dashed border-black/20 p-3">
        <p className="mb-2 text-sm font-bold">ملاحظات المعلم/ـة:</p>
        <div className="space-y-4">
          <div className="border-b border-dotted border-black/30" />
          <div className="border-b border-dotted border-black/30" />
        </div>
      </div>
      <ReportFooter page={`طالب ${index + 1}`} />
    </section>
  );
}

/* --------------------------------- view --------------------------------- */
export default function ReportView() {
  const params = useSearchParams();
  const router = useRouter();
  const studentId = params.get("studentId");
  const autoPrint = params.get("print") === "1";
  const [details, setDetails] = useState(params.get("details") !== "0");
  const [bestOnly, setBestOnly] = useState(params.get("best") !== "0"); // default: best attempt only
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [students, setStudents] = useState<ProgressRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAuthed(Boolean(getTeacherPin())), []);

  useEffect(() => {
    if (!authed) return;
    fetch(`/api/progress?class=${encodeURIComponent(FIXED_CLASS)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { students?: ProgressRecord[] }) => setStudents(d.students ?? []))
      .catch(() => setError("تعذر تحميل البيانات"));
  }, [authed]);

  useEffect(() => {
    if (!autoPrint || !students) return;
    const t = setTimeout(() => window.print(), 900);
    return () => clearTimeout(t);
  }, [autoPrint, students]);

  const list = useMemo(() => {
    const base = studentId ? (students ?? []).filter((s) => s.studentId === studentId) : (students ?? []);
    return bestOnly ? base.map((s) => bestAttemptRecord(s)) : base;
  }, [students, studentId, bestOnly]);
  const multiAttemptCount = useMemo(() => (students ?? []).filter((s) => allAttempts(s).length > 1).length, [students]);
  const single = Boolean(studentId);

  if (authed === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="card p-8 text-center">
          <p className="text-lg font-bold">يرجى تسجيل الدخول من لوحة تحكم المعلم أولاً.</p>
          <Link href="/teacher" className="btn-primary mt-4">
            الذهاب إلى لوحة التحكم
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen print:bg-white">
      <div className="sticky top-0 z-30 border-b border-black/5 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6">
          <button className="btn-ghost px-3 py-2" onClick={() => router.push("/teacher")}>
            → رجوع
          </button>
          <h1 className="font-heading text-lg font-black text-saudi">📄 {single ? "تقرير الطالب" : "تقرير الفصل"} — PDF</h1>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {!single && (
              <label className="flex items-center gap-2 rounded-2xl bg-sand px-3 py-2 text-sm font-bold">
                <input type="checkbox" className="h-4 w-4 accent-saudi" checked={details} onChange={(e) => setDetails(e.target.checked)} />
                تضمين صفحة لكل طالب
              </label>
            )}
            <button className="btn-primary text-lg" onClick={() => window.print()} disabled={!students}>
              🖨️ حفظ PDF / طباعة
            </button>
          </div>
        </div>
        {/* Attempts mode — prominent segmented control */}
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-3 pb-2 sm:px-6">
          <span className="font-heading text-base font-extrabold text-ink">🔁 المحاولات في التقرير:</span>
          <div className="flex rounded-2xl bg-sand p-1 ring-1 ring-sand-dark" role="radiogroup" aria-label="اختيار المحاولات">
            <button
              type="button"
              role="radio"
              aria-checked={bestOnly}
              onClick={() => setBestOnly(true)}
              className={cx("rounded-xl px-4 py-2 font-heading text-base font-bold transition", bestOnly ? "bg-amber-500 text-white shadow" : "text-ink/60 hover:bg-white")}
            >
              ⭐ المحاولة الأفضل فقط
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!bestOnly}
              onClick={() => setBestOnly(false)}
              className={cx("rounded-xl px-4 py-2 font-heading text-base font-bold transition", !bestOnly ? "bg-maroon text-white shadow" : "text-ink/60 hover:bg-white")}
            >
              📋 جميع المحاولات
            </button>
          </div>
          <span className="text-sm text-ink/60">
            {bestOnly ? "يُعرض لكل طالب تقدم واختبار محاولته الأفضل وتُخفى بقية المحاولات." : "تُعرض مقارنة كل المحاولات لكل طالب."}
            {multiAttemptCount > 0 ? ` (${multiAttemptCount} طالب لديهم أكثر من محاولة)` : " (لا يوجد طلاب بأكثر من محاولة حالياً)"}
          </span>
        </div>
        <p className="mx-auto max-w-5xl px-3 pb-2 text-xs text-ink/50 sm:px-6">💡 في نافذة الطباعة اختر الوجهة «حفظ بصيغة PDF» وفعّل «رسومات الخلفية» للحصول على الألوان كاملة.</p>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-2 py-5 print:max-w-none print:gap-0 print:p-0">
        {error && <div className="card p-6 text-center text-rose-700">{error}</div>}
        {!students && !error && (
          <div className="card flex items-center justify-center gap-3 p-10 text-lg font-bold text-saudi">
            <span className="h-6 w-6 animate-spin rounded-full border-4 border-saudi border-t-transparent" /> جارٍ إعداد التقرير...
          </div>
        )}
        {students && !single && <ClassReport students={list} bestOnly={bestOnly} />}
        {students && (single || details) && list.map((s, i) => <StudentReport key={s.studentId} s={s} index={i} bestOnly={bestOnly} />)}
        {students && single && list.length === 0 && <div className="card p-6 text-center">لم يتم العثور على الطالب.</div>}
      </div>
    </div>
  );
}
