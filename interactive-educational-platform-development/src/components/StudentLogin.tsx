"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  fetchRoster,
  formatDate,
  getSession,
  loginStudent,
  setSession,
  type RosterItem,
  type StudentSession,
  type TakenInfo,
} from "@/lib/client-api";
import { FIXED_CLASS, FIXED_CLASS_FULL, FIXED_CLASS_LABEL } from "@/lib/config";
import { TOTAL_SLIDES } from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";

export default function StudentLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ detail?: string; hint?: string; code?: string; retry: boolean } | null>(null);
  const [existing, setExisting] = useState<StudentSession | null>(null);
  const [taken, setTaken] = useState<TakenInfo | null>(null);

  useEffect(() => {
    setExisting(getSession());
    void fetchRoster(FIXED_CLASS).then(setRoster);
  }, []);

  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length >= 2);
  const inRoster = roster.some((r) => r.name === trimmed);
  const valid = inRoster || words.length >= 2;

  const submit = async (confirmResume = false) => {
    setError(null);
    setErrorInfo(null);
    if (!valid) {
      setError("اكتب اسمك الثلاثي كاملاً (مثال: محمد أحمد العتيبي)");
      return;
    }
    setBusy(true);
    try {
      playSound("click");
      const res = await loginStudent({ name: trimmed, className: FIXED_CLASS, confirmResume });
      if (!res.ok) {
        setTaken(
          res.existing ?? { name: trimmed, currentSlide: 0, maxSlide: 0, completed: false, lastSeenAt: new Date().toISOString(), locked: false },
        );
        return;
      }
      setSession(res.student);
      router.push("/lesson");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrorInfo({ detail: err.detail, hint: err.hint, code: err.code, retry: err.retry });
      } else {
        setError(err instanceof Error ? err.message : "حدث خطأ، حاول مرة أخرى");
        setErrorInfo({ retry: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const notMe = () => {
    playSound("click");
    setTaken(null);
    setManual(true);
    setName("");
    setError("لا يمكن تكرار الاسم في الفصل. اكتب اسمك الثلاثي كاملاً ليختلف عن زملائك، أو راجع معلمك.");
  };

  return (
    <div className="card p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-black text-saudi sm:text-3xl">👋 أهلاً بك يا بطل!</h2>
          <p className="mt-1 text-lg text-ink/60">اكتب اسمك لتبدأ الدرس أو تكمل من حيث توقفت.</p>
        </div>
        <span className="shrink-0 rounded-2xl bg-navy px-3 py-2 text-center font-heading text-lg font-extrabold leading-tight text-white">
          فصل {FIXED_CLASS_LABEL}
          <span className="block text-[11px] font-normal text-white/70">{FIXED_CLASS_FULL}</span>
        </span>
      </div>

      {existing && !taken && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-saudi-light p-3 ring-1 ring-saudi/20">
          <div>
            <p className="text-sm text-ink/60">آخر دخول على هذا الجهاز:</p>
            <p className="font-heading text-lg font-extrabold">
              {existing.name} {existing.locked && "🔒"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary py-2 text-lg" onClick={() => { playSound("click"); router.push("/lesson"); }}>
              متابعة ▶
            </button>
            <button className="btn-ghost py-2" onClick={() => { setSession(null); setExisting(null); }}>
              لست أنا
            </button>
          </div>
        </div>
      )}

      {taken ? (
        <div className="pop mt-5 rounded-3xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
          <h3 className="font-heading text-xl font-extrabold text-amber-900">⚠️ هذا الاسم مسجل مسبقاً في فصل {FIXED_CLASS_LABEL}</h3>
          <p className="mt-2 text-lg leading-relaxed text-amber-900">
            الاسم <b>«{taken.name}»</b> وصل إلى الشريحة <b>{taken.maxSlide + 1}</b> من {TOTAL_SLIDES}
            {taken.completed && " وأكمل الدرس"} — آخر دخول: {formatDate(taken.lastSeenAt)}.
          </p>
          <p className="mt-1 text-lg font-bold text-amber-900">هل أنت صاحب هذا الاسم؟</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="btn-primary text-lg" disabled={busy} onClick={() => submit(true)}>
              ✅ نعم، أكمل تقدمي
            </button>
            <button className="btn-secondary text-lg" disabled={busy} onClick={notMe}>
              ✋ لا، هذا ليس أنا
            </button>
          </div>
          <p className="mt-2 text-sm text-amber-800/80">لا يُسمح بتكرار الاسم نفسه لطالبين في الفصل.</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="mt-5 grid gap-4"
        >
          <div>
            <label className="mb-1 block font-heading text-lg font-bold">الاسم الثلاثي</label>
            {roster.length > 0 && !manual ? (
              <div className="grid gap-2">
                <select className="input text-xl" value={name} onChange={(e) => setName(e.target.value)}>
                  <option value="">— اختر اسمك من قائمة المعلم —</option>
                  {roster.map((r) => (
                    <option key={r.studentId} value={r.name}>
                      {r.name}
                      {r.claimed ? " (مسجل ✓)" : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className="text-start text-base text-navy underline" onClick={() => { setManual(true); setName(""); }}>
                  اسمي غير موجود في القائمة
                </button>
              </div>
            ) : (
              <div className="grid gap-1">
                <input className="input text-xl" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: محمد أحمد العتيبي" autoComplete="name" />
                {trimmed.length > 0 && words.length < 2 && <p className="text-sm text-amber-700">اكتب اسمك الثلاثي (الاسم، اسم الأب، العائلة)</p>}
                {roster.length > 0 && (
                  <button type="button" className="text-start text-base text-navy underline" onClick={() => setManual(false)}>
                    العودة إلى قائمة المعلم
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-2xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <p className="text-base font-bold leading-relaxed text-rose-700">⚠️ {error}</p>
              {errorInfo?.hint && <p className="mt-1 text-sm leading-relaxed text-rose-800/80">💡 {errorInfo.hint}</p>}
              {errorInfo?.retry && (
                <button type="button" className="btn-secondary mt-2 py-2 text-sm" onClick={() => void submit(false)} disabled={busy}>
                  🔄 إعادة المحاولة
                </button>
              )}
              {errorInfo?.detail && (
                <details className="mt-2 text-xs text-rose-900/70">
                  <summary className="cursor-pointer select-none font-bold">تفاصيل تقنية للمعلم</summary>
                  <p dir="ltr" className="mt-1 break-all rounded-lg bg-white/70 p-2 text-left font-mono">
                    {errorInfo.code ? `[${errorInfo.code}] ` : ""}
                    {errorInfo.detail}
                  </p>
                  <p className="mt-1">
                    للفحص الكامل: <a className="underline" href="/api/progress?diagnose=true" target="_blank" rel="noreferrer">/api/progress?diagnose=true</a> — لإنشاء الجداول: <a className="underline" href="/api/setup" target="_blank" rel="noreferrer">/api/setup</a>
                  </p>
                </details>
              )}
            </div>
          )}

          <button type="submit" className="btn-primary py-4 text-xl" disabled={busy || !trimmed}>
            {busy ? "لحظة..." : "ابدأ الدرس 🚀"}
          </button>
        </form>
      )}
    </div>
  );
}
