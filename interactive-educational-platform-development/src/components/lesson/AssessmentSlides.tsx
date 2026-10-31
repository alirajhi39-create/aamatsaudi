"use client";

import { useEffect, useMemo, useState } from "react";
import { ACTIVITY1, ACTIVITY2, EXIT_CONFIDENCE, EXIT_SECTIONS, LESSON_TITLE, QUIZ } from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";
import { ChoiceList, Confetti, DoneBanner, Feedback, OptionButton, ProgressRing, cx } from "@/components/ui";
import { arr, num, rec, str, type SlideProps } from "./types";
import { randomPerm, shuffle, useShuffled } from "./useShuffle";

function sameSet(sel: string[], correct: string[]) {
  return sel.length === correct.length && correct.every((c) => sel.includes(c));
}

/* ------------------------------ Activity 1 ------------------------------ */
const PHASES = [
  { id: "think", label: "فكّر", icon: "🤔", desc: "اختر إجابتك بنفسك" },
  { id: "pair", label: "زاوج", icon: "👥", desc: "ناقش إجابتك مع زميلك" },
  { id: "share", label: "شارك", icon: "🗣️", desc: "اكشف الإجابة الصحيحة" },
];

export function Activity1Slide({ value, update, done, markDone }: SlideProps) {
  const phase = num(value.phase, 0);
  const a = typeof value.a === "number" ? (value.a as number) : null;
  const b = arr<string>(value.b);
  const pair = str(value.pair);
  const [openHint, setOpenHint] = useState<string | null>(null);

  const { partA, partB } = ACTIVITY1;
  const partAOptions = useShuffled(partA.options);
  const partBOptions = useShuffled(partB.options);
  const revealed = phase >= 2;
  const aOk = a !== null && Boolean(partA.options[a]?.correct);
  const bCorrect = partB.options.filter((o) => o.correct).map((o) => o.text);
  const bOk = sameSet(b, bCorrect);
  const canPair = a !== null && b.length === partB.pick;

  const setPhase = (p: number) => {
    playSound("click");
    update({ phase: p });
    if (p === 2) {
      playSound(aOk && bOk ? "success" : "correct");
      const attempts = num(value.attempts, 0) + 1;
      update({ attempts, aOk, bOk });
      if (!done) markDone();
    }
  };
  const retry = () => {
    playSound("click");
    update({ phase: 0, a: null, b: [], pair: "" });
  };

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-2 rounded-3xl bg-white/80 p-2 ring-1 ring-black/5 sm:p-3">
        {PHASES.map((p, i) => (
          <button key={p.id} onClick={() => i <= phase && setPhase(i)} className={cx("flex flex-1 flex-col items-center gap-1 rounded-2xl p-2 transition", i === phase ? "bg-saudi text-white" : i < phase ? "bg-saudi-light text-saudi" : "text-ink/40")}>
            <span className="text-2xl">{p.icon}</span>
            <span className="font-heading text-lg font-extrabold">{p.label}</span>
            <span className="hidden text-xs sm:block">{p.desc}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Part A — single choice */}
        <div className="card p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <h4 className="min-w-0 flex-1 basis-56 font-heading text-lg font-extrabold leading-relaxed text-maroon sm:text-xl">
              {partA.label}- {partA.question}
            </h4>
            {!revealed && (
              <button type="button" className="chip shrink-0 whitespace-nowrap bg-gold-light px-4 py-1.5 text-base text-amber-900 ring-1 ring-gold/40" onClick={() => setOpenHint(openHint === "a" ? null : "a")}>
                💡 تلميح
              </button>
            )}
          </div>
          {openHint === "a" && !revealed && (
            <ul className="mb-2 list-inside list-disc rounded-xl bg-gold-light/60 p-2 text-base text-amber-900">
              {partA.hints.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
          <p className="mb-2 text-sm text-ink/60">اختر إجابة واحدة:</p>
          <ChoiceList
            single
            options={partAOptions}
            selected={a !== null && partA.options[a] ? [partA.options[a].text] : []}
            onToggle={(t) => {
              if (revealed) return;
              playSound("click");
              update({ a: partA.options.findIndex((o) => o.text === t) });
            }}
            reveal={revealed ? "all" : undefined}
            disabled={revealed}
          />
          {revealed && (
            <div className="mt-3">
              <Feedback kind={aOk ? "correct" : "wrong"}>{partA.explain}</Feedback>
            </div>
          )}
        </div>

        {/* Part B — pick two */}
        <div className="card p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
            <h4 className="min-w-0 flex-1 basis-56 font-heading text-lg font-extrabold leading-relaxed text-maroon sm:text-xl">
              {partB.label}- {partB.question}
            </h4>
            {!revealed && (
              <button type="button" className="chip shrink-0 whitespace-nowrap bg-gold-light px-4 py-1.5 text-base text-amber-900 ring-1 ring-gold/40" onClick={() => setOpenHint(openHint === "b" ? null : "b")}>
                💡 تلميح
              </button>
            )}
          </div>
          {openHint === "b" && !revealed && (
            <ul className="mb-2 list-inside list-disc rounded-xl bg-gold-light/60 p-2 text-base text-amber-900">
              {partB.hints.map((h) => <li key={h}>{h}</li>)}
            </ul>
          )}
          <p className="mb-2 text-sm text-ink/60">
            اختر سببين ({b.length}/{partB.pick}):
          </p>
          <ChoiceList
            options={partBOptions}
            selected={b}
            max={partB.pick}
            onToggle={(t) => {
              if (revealed) return;
              playSound("click");
              update({ b: b.includes(t) ? b.filter((x) => x !== t) : [...b, t] });
            }}
            reveal={revealed ? "all" : undefined}
            disabled={revealed}
          />
          {revealed && (
            <div className="mt-3">
              <Feedback kind={bOk ? "correct" : "wrong"}>{partB.explain}</Feedback>
            </div>
          )}
        </div>
      </div>

      {phase === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
          <span className="text-base text-ink/60">{canPair ? "ممتاز! انتقل الآن لمناقشة إجابتك مع زميلك." : "اختر إجابة في (أ) وسببين في (ب) للانتقال إلى مرحلة «زاوج»."}</span>
          <button className="btn-primary text-lg" disabled={!canPair} onClick={() => setPhase(1)}>
            👥 انتقل إلى «زاوج»
          </button>
        </div>
      )}
      {phase === 1 && (
        <div className="card p-4 sm:p-5">
          <h4 className="font-heading text-lg font-extrabold text-navy">👥 ناقش إجابتك مع زميلك ثم اختر ما حدث:</h4>
          <p className="mb-3 text-sm text-ink/60">يمكنك تعديل اختياراتك في الأعلى بعد المناقشة قبل كشف الإجابة.</p>
          <ChoiceList
            single
            options={ACTIVITY1.pairOptions.map((o) => ({ text: `${o.emoji} ${o.text}` }))}
            selected={ACTIVITY1.pairOptions.filter((o) => o.id === pair).map((o) => `${o.emoji} ${o.text}`)}
            onToggle={(t) => {
              playSound("click");
              const found = ACTIVITY1.pairOptions.find((o) => `${o.emoji} ${o.text}` === t);
              update({ pair: found?.id ?? "" });
            }}
          />
          <button className="btn-primary mt-3 text-lg" disabled={!pair || !canPair} onClick={() => setPhase(2)}>
            🗣️ انتقل إلى «شارك» واكشف الإجابة
          </button>
        </div>
      )}
      {revealed && (
        <div className="grid gap-3">
          {aOk && bOk ? (
            <DoneBanner>🌟 أحسنت! إجاباتك في النشاط الأول صحيحة بالكامل.</DoneBanner>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3 ring-2 ring-amber-200">
              <span className="text-lg text-amber-900">
                أكملت النشاط ({(aOk ? 1 : 0) + (bOk ? 1 : 0)}/2 صحيح). راجع الإجابات الملوّنة بالأعلى.
              </span>
              <button className="btn-secondary" onClick={retry}>
                🔁 أعد المحاولة
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Activity 2 ------------------------------ */
export function Activity2Slide({ value, update, done, markDone }: SlideProps) {
  const effectOptions = useShuffled(ACTIVITY2.effects);
  const sentenceOptions = useMemo(() => ACTIVITY2.sentence.map((b) => shuffle(b.options)), []);
  const effects = arr<string>(value.effects);
  const sentence = rec(value.sentence);
  const checked = Boolean(value.checked);
  const shownHints = num(value.hints, 0);

  const correctEffects = ACTIVITY2.effects.filter((e) => e.correct).map((e) => e.text);
  const effectsOk = sameSet(effects, correctEffects);
  const sentenceOk = ACTIVITY2.sentence.every((bl) => sentence[bl.id] === bl.answer);
  const complete = effects.length === ACTIVITY2.effectsPick && ACTIVITY2.sentence.every((bl) => Boolean(sentence[bl.id]));
  const locked = done;

  const check = () => {
    const ok = effectsOk && sentenceOk;
    playSound(ok ? "success" : "wrong");
    update({ checked: true, attempts: num(value.attempts, 0) + 1 });
    if (ok && !done) markDone();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="grid content-start gap-4 lg:col-span-3">
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-3">
            <span className="rounded-xl bg-maroon px-3 py-1 font-heading text-lg font-black text-white">نشاط ٢</span>
            <span className="text-2xl">✏️</span>
          </div>
          <h4 className="font-heading text-lg font-extrabold text-maroon sm:text-xl">{ACTIVITY2.question}</h4>
          <p className="mb-2 mt-1 text-sm text-ink/60">
            اختر النتائج الصحيحة (ثلاث نتائج) — {effects.length}/{ACTIVITY2.effectsPick}
          </p>
          <ChoiceList
            options={effectOptions}
            selected={effects}
            max={ACTIVITY2.effectsPick}
            disabled={locked}
            reveal={checked ? "all" : undefined}
            onToggle={(t) => {
              playSound("click");
              update({ effects: effects.includes(t) ? effects.filter((x) => x !== t) : [...effects, t], checked: false });
            }}
          />
        </div>

        <div className="card p-4 sm:p-5">
          <h4 className="font-heading text-lg font-extrabold text-saudi">🧩 أكمل الجملة باختيار الكلمة المناسبة:</h4>
          <div className="mt-3 grid gap-3">
            {ACTIVITY2.sentence.map((bl, idx) => {
              const v = sentence[bl.id];
              return (
                <div key={bl.id} className="rounded-2xl bg-sand/70 p-3">
                  <p className="mb-2 text-lg font-bold">{bl.before} ...</p>
                  <div className="flex flex-wrap gap-2">
                    {sentenceOptions[idx].map((opt) => {
                      const sel = v === opt;
                      const state = checked && sel ? (opt === bl.answer ? "ok" : "bad") : sel ? "sel" : "none";
                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={locked}
                          onClick={() => {
                            playSound("click");
                            update({ sentence: { ...sentence, [bl.id]: opt }, checked: false });
                          }}
                          className={cx(
                            "rounded-2xl border-2 px-4 py-2 text-lg font-bold transition",
                            state === "none" && "border-sand-dark bg-white hover:border-saudi",
                            state === "sel" && "border-saudi bg-saudi text-white",
                            state === "ok" && "border-emerald-500 bg-emerald-500 text-white",
                            state === "bad" && "border-rose-500 bg-rose-500 text-white line-through",
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {!locked && (
            <button className="btn-primary mt-4 text-lg" disabled={!complete} onClick={check}>
              تحقق من إجاباتي ✔
            </button>
          )}
          {checked && !(effectsOk && sentenceOk) && (
            <div className="mt-3">
              <Feedback kind="wrong">
                {!effectsOk && "بعض النتائج التي اخترتها غير صحيحة (راجع الألوان في الأعلى). "}
                {!sentenceOk && "هناك كلمة غير مناسبة في الجملة. "}
                استعن بالتلميحات وحاول مرة أخرى.
              </Feedback>
            </div>
          )}
        </div>
        {done && (
          <div className="grid gap-3">
            <div className="rounded-2xl bg-saudi-light p-4 ring-1 ring-saudi/20">
              <p className="mb-1 text-sm font-bold text-saudi">الإجابة النموذجية:</p>
              <p className="text-lg leading-[1.9]">{ACTIVITY2.model}</p>
            </div>
            <DoneBanner>أحسنت! أكملت النشاط الثاني بنجاح.</DoneBanner>
          </div>
        )}
      </div>
      <div className="grid content-start gap-3 lg:col-span-2">
        <div className="card p-4">
          <h5 className="mb-2 font-heading text-lg font-extrabold text-saudi">💡 تلميحات مساعدة</h5>
          <ul className="grid gap-2">
            {ACTIVITY2.hints.map((h, i) => (
              <li key={h}>
                {i < shownHints ? (
                  <div className="pop rounded-xl bg-gold-light p-2 text-base text-amber-900">{h}</div>
                ) : i === shownHints ? (
                  <button className="btn-secondary w-full py-2" onClick={() => { playSound("click"); update({ hints: shownHints + 1 }); }}>
                    اكشف التلميح {i + 1}
                  </button>
                ) : (
                  <div className="rounded-xl bg-sand p-2 text-center text-sm text-ink/40">🔒 التلميح {i + 1}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <Feedback kind="info">كلمات مفتاحية قد تساعدك: الرياض — ١٢٩٣هـ — عاصر النزاع — تطلع الناس — عودة الحكم — المرة الثالثة.</Feedback>
      </div>
    </div>
  );
}

/* ---------------------------------- Quiz ---------------------------------- */
export function QuizSlide({ value, update, done, markDone, onQuizSubmit, quiz }: SlideProps) {
  const [current, setCurrent] = useState(num(value.current, 0));
  // Random option order per question — new order on every visit and on every retry
  const [perms, setPerms] = useState(() => QUIZ.map((qq) => randomPerm(qq.options.length)));
  const answers = rec(value.answers); // qIndex -> original optionIndex
  const finished = Boolean(value.finished);
  const [reveal, setReveal] = useState<number | null>(answers[String(current)] !== undefined ? Number(answers[String(current)]) : null);
  const q = QUIZ[current];
  const score = useMemo(() => QUIZ.filter((qq, i) => Number(answers[String(i)]) === qq.answer).length, [answers]);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    setReveal(answers[String(current)] !== undefined ? Number(answers[String(current)]) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const choose = (i: number) => {
    if (reveal !== null) return;
    const ok = i === q.answer;
    playSound(ok ? "correct" : "wrong");
    setReveal(i);
    update({ answers: { ...answers, [String(current)]: String(i) } });
  };
  const nextQ = () => {
    playSound("click");
    if (current < QUIZ.length - 1) {
      setCurrent(current + 1);
      update({ current: current + 1 });
    } else {
      const finalScore = QUIZ.filter((qq, i) => Number({ ...answers }[String(i)]) === qq.answer).length;
      const history = Array.isArray(value.history) ? (value.history as Array<{ score: number; total: number; at: string }>) : [];
      update({ finished: true, history: [...history, { score: finalScore, total: QUIZ.length, at: new Date().toISOString() }] });
      onQuizSubmit?.(finalScore, QUIZ.length);
      playSound(finalScore >= QUIZ.length * 0.8 ? "celebrate" : "success");
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 4000);
      if (!done) markDone();
    }
  };
  const retry = () => {
    playSound("click");
    setCurrent(0);
    setReveal(null);
    setPerms(QUIZ.map((qq) => randomPerm(qq.options.length)));
    update({ answers: {}, current: 0, finished: false });
  };

  if (finished) {
    const percent = Math.round((score / QUIZ.length) * 100);
    const msg = percent === 100 ? "ممتاز! علامة كاملة 🌟" : percent >= 80 ? "رائع! أداء متميز 👏" : percent >= 60 ? "جيد! راجع الأخطاء لتتحسن 💪" : "لا بأس، أعد قراءة الدرس وحاول مرة أخرى 📖";
    return (
      <div className="grid gap-5">
        <Confetti show={celebrate} />
        <div className="card flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-start">
          <div className="relative">
            <ProgressRing percent={percent} size={120} stroke={10} color={percent >= 60 ? "#0f6e56" : "#a0353f"} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-heading text-2xl font-black text-ink">{percent}%</span>
              <span className="text-xs text-ink/60">{score}/{QUIZ.length}</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-heading text-2xl font-black text-saudi">نتيجة الاختبار الختامي</h3>
            <p className="mt-1 text-lg">{msg}</p>
            <p className="mt-1 text-sm text-ink/60">عدد المحاولات: {Math.max(quiz.attempts, 1)} — تم حفظ درجتك لدى المعلم.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={retry}>🔁 إعادة المحاولة</button>
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUIZ.map((qq, i) => {
            const a = Number(answers[String(i)]);
            const ok = a === qq.answer;
            return (
              <div key={i} className={cx("rounded-2xl border-2 p-3 text-base", ok ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50")}>
                <p className="font-bold">{i + 1}. {qq.q}</p>
                <p className={cx("mt-1", ok ? "text-emerald-800" : "text-rose-800")}>{ok ? "✔" : "✘"} إجابتك: {qq.options[a] ?? "—"}</p>
                {!ok && <p className="mt-1 text-emerald-800">✔ الصحيح: {qq.options[qq.answer]}</p>}
              </div>
            );
          })}
        </div>
        <DoneBanner>أكملت الاختبار. انتقل إلى بطاقة الخروج للحصول على شهادتك.</DoneBanner>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between rounded-3xl bg-white/80 p-3 ring-1 ring-black/5">
        <span className="font-heading text-lg font-extrabold text-saudi">🏆 السؤال {current + 1} من {QUIZ.length}</span>
        <div className="flex gap-1">
          {QUIZ.map((qq, i) => {
            const a = answers[String(i)];
            return <span key={i} className={cx("h-2.5 w-4 rounded-full", a === undefined ? (i === current ? "bg-saudi" : "bg-sand-dark") : Number(a) === qq.answer ? "bg-emerald-500" : "bg-rose-400")} />;
          })}
        </div>
      </div>
      <div key={current} className="card slide-enter p-4 sm:p-6">
        <h3 className="mb-4 font-heading text-xl font-extrabold leading-relaxed text-ink sm:text-2xl">{q.q}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {perms[current].map((orig, pos) => {
            const o = q.options[orig];
            let state: "idle" | "correct" | "wrong" | "disabled" = "idle";
            if (reveal !== null) state = orig === q.answer ? "correct" : orig === reveal ? "wrong" : "disabled";
            return (
              <OptionButton key={orig} index={pos} state={state} onClick={() => choose(orig)}>
                {o}
              </OptionButton>
            );
          })}
        </div>
        {reveal !== null && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex-1">
              <Feedback kind={reveal === q.answer ? "correct" : "wrong"}>{q.explain}</Feedback>
            </div>
            <button className="btn-primary text-lg" onClick={nextQ}>
              {current < QUIZ.length - 1 ? "السؤال التالي ▶" : "عرض النتيجة 🏁"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Exit ticket ------------------------------ */
export function ExitSlide({ value, update, done, markDone, session, quiz, onLessonComplete, onRestart, onExit, round = 1 }: SlideProps) {
  const exitOptions = useMemo(() => EXIT_SECTIONS.map((sec) => shuffle(sec.options)), []);
  const learned = arr<string>(value.learned);
  const liked = arr<string>(value.liked);
  const question = str(value.question);
  const confidence = num(value.confidence, 0);
  const [celebrate, setCelebrate] = useState(false);

  const picked = (id: "learned" | "liked" | "question") => (id === "learned" ? learned : id === "liked" ? liked : question ? [question] : []);
  const canFinish = EXIT_SECTIONS.every((sec) => picked(sec.id).length === sec.pick) && confidence > 0;

  const toggle = (id: "learned" | "liked" | "question", text: string) => {
    playSound("click");
    if (id === "question") return update({ question: question === text ? "" : text });
    const list = id === "learned" ? learned : liked;
    update({ [id]: list.includes(text) ? list.filter((x) => x !== text) : [...list, text] });
  };

  const finish = () => {
    playSound("celebrate");
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 5000);
    markDone({ finishedAt: new Date().toISOString() });
    onLessonComplete?.();
  };
  const percent = quiz.total ? Math.round(((quiz.score ?? 0) / quiz.total) * 100) : null;
  const today = new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date());

  return (
    <div className="grid gap-5">
      <Confetti show={celebrate} count={140} />
      {!done ? (
        <>
          <div className="grid gap-4">
            {EXIT_SECTIONS.map((sec, si) => {
              const sel = picked(sec.id);
              return (
                <div key={sec.id} className="card p-4 sm:p-5">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h5 className="font-heading text-lg font-extrabold text-navy sm:text-xl">
                      {sec.icon} {sec.label}
                    </h5>
                    <span className={cx("chip", sel.length === sec.pick ? "bg-emerald-50 text-emerald-700" : "bg-sand text-ink/60")}>
                      {sel.length}/{sec.pick}
                    </span>
                  </div>
                  <ChoiceList options={exitOptions[si].map((text) => ({ text }))} selected={sel} max={sec.pick} single={sec.pick === 1} columns={2} onToggle={(t) => toggle(sec.id, t)} />
                </div>
              );
            })}
            <div className="card p-4 sm:p-5">
              <h5 className="mb-3 font-heading text-lg font-extrabold text-navy sm:text-xl">🙂 كيف تقيّم فهمك للدرس اليوم؟</h5>
              <div className="grid grid-cols-3 gap-2">
                {EXIT_CONFIDENCE.map((c) => (
                  <button key={c.value} type="button" onClick={() => { playSound("click"); update({ confidence: c.value }); }} className={cx("flex flex-col items-center gap-1 rounded-2xl border-2 p-3 transition", confidence === c.value ? "border-saudi bg-saudi-light ring-4 ring-saudi/15" : "border-sand-dark bg-white hover:border-saudi")}>
                    <span className="text-4xl">{c.emoji}</span>
                    <span className="text-center text-sm font-bold leading-tight sm:text-base">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
            <span className="text-base text-ink/60">{canFinish ? "اكتملت بطاقة الخروج! اضغط للحصول على شهادتك." : "أكمل جميع اختيارات بطاقة الخروج وقيّم فهمك."}</span>
            <button className="btn-maroon text-lg" disabled={!canFinish} onClick={finish}>
              🎓 إنهاء الدرس والحصول على الشهادة
            </button>
          </div>
        </>
      ) : (
        <div className="grid gap-4">
          <div id="certificate" className="relative overflow-hidden rounded-3xl border-8 border-double border-gold bg-gradient-to-br from-white via-gold-light/40 to-saudi-light p-6 text-center shadow-2xl sm:p-10">
            <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-gold/20" />
            <div className="absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-saudi/15" />
            <p className="font-heading text-sm font-bold tracking-widest text-maroon">شهادة إتمام درس</p>
            <h2 className="mt-2 font-heading text-3xl font-black text-saudi sm:text-4xl">{LESSON_TITLE}</h2>
            <p className="mt-4 text-lg text-ink/70">تشهد المنصة بأن الطالب/ـة</p>
            <p className="my-2 font-heading text-3xl font-black text-ink">{session.name}</p>
            <p className="text-lg text-ink/70">من فصل <b className="text-saudi">{session.className}</b> قد أتم الدرس بنجاح</p>
            {percent !== null && (
              <p className="mt-3 inline-block rounded-2xl bg-white px-5 py-2 font-heading text-xl font-extrabold text-maroon ring-2 ring-gold">
                نتيجة الاختبار: {quiz.score} / {quiz.total} ({percent}%)
              </p>
            )}
            <div className="mt-6 flex items-center justify-between text-sm text-ink/60">
              <span>التاريخ: {today}</span>
              <span className="text-3xl">🏅</span>
              <span>الدراسات الاجتماعية — السادس الابتدائي</span>
            </div>
          </div>
          <div className="grid gap-2 print:hidden sm:grid-cols-3">
            <button className="btn-secondary text-lg" onClick={() => window.print()}>
              🖨️ طباعة الشهادة
            </button>
            <button className="btn-maroon text-lg" onClick={() => void onRestart?.()}>
              🔁 إعادة الدرس من البداية
            </button>
            <button className="btn-primary text-lg" onClick={onExit}>
              🚪 خروج من الدرس
            </button>
          </div>
          <DoneBanner>
            🎉 مبارك! أكملت درس «{LESSON_TITLE}» بجميع أنشطته{round > 1 ? ` (المحاولة ${round})` : ""}. تم حفظ تقدمك ودرجتك لدى المعلم. يمكنك إعادة الدرس بالاسم نفسه لتحسين نتيجتك، وستبقى محاولتك السابقة محفوظة.
          </DoneBanner>
        </div>
      )}
    </div>
  );
}
