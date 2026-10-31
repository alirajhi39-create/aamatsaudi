"use client";

import { useEffect, useState } from "react";
import LessonImage from "@/components/LessonImage";
import {
  ABDULLAH_CARDS,
  ASAD_QUOTE,
  BATTLE_QUESTIONS,
  BIG_QUESTION,
  FAISAL_CHECK,
  FAISAL_KEYWORDS,
  KWL_KNOW_NONE,
  KWL_KNOW_OPTIONS,
  KWL_WANT_OPTIONS,
  LESSON_SUBTITLE,
  LESSON_TITLE,
  OBJECTIVES,
  RESPECT_BEHAVIORS,
  STORY_CHECK,
  STORY_SCENES,
  VALUES_OPTIONS,
} from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";
import { ChoiceList, DoneBanner, Feedback, InfoBox, OptionButton, cx } from "@/components/ui";
import { arr, num, type SlideProps } from "./types";
import { usePerm, useShuffled } from "./useShuffle";

/* ------------------------------ Quick MCQ check ------------------------------ */
export function McqCheck({
  question,
  options,
  answer,
  chosen,
  onChoose,
  hint,
}: {
  question: string;
  options: string[];
  answer: number;
  chosen: number | null;
  onChoose: (i: number, correct: boolean) => void;
  hint?: string;
}) {
  const [showHint, setShowHint] = useState(false);
  const perm = usePerm(options.length); // options are displayed in a random order each time
  const solved = chosen === answer;
  return (
    <div className="rounded-3xl bg-saudi-light/60 p-4 ring-1 ring-saudi/20 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h4 className="font-heading text-lg font-extrabold text-saudi">🤔 تحقق من فهمك: {question}</h4>
        {hint && !solved && (
          <button className="chip bg-gold-light text-amber-900 ring-1 ring-gold/40" onClick={() => setShowHint((s) => !s)}>
            💡 تلميح
          </button>
        )}
      </div>
      {showHint && hint && !solved && <p className="mb-3 rounded-xl bg-white/70 p-2 text-sm text-amber-900">{hint}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {perm.map((orig, pos) => {
          const o = options[orig];
          let state: "idle" | "correct" | "wrong" | "disabled" = "idle";
          if (solved) state = orig === answer ? "correct" : "disabled";
          else if (chosen === orig) state = "wrong";
          return (
            <OptionButton key={orig} index={pos} state={state} onClick={() => onChoose(orig, orig === answer)}>
              {o}
            </OptionButton>
          );
        })}
      </div>
      {chosen !== null && !solved && <div className="mt-3"><Feedback kind="wrong">ليست الإجابة الصحيحة، أعد قراءة النص وحاول مرة أخرى.</Feedback></div>}
      {solved && <div className="mt-3"><Feedback kind="correct">إجابة صحيحة! أحسنت.</Feedback></div>}
    </div>
  );
}

/* --------------------------------- Cover --------------------------------- */
export function CoverSlide({ session, done, markDone, next }: SlideProps) {
  useEffect(() => {
    if (!done) markDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="relative min-h-[260px] overflow-hidden rounded-3xl lg:col-span-2">
        <LessonImage src="/images/hero.jpg" alt="قلعة في نجد" fill className="object-cover" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-4 right-4 left-4 text-white">
          <p className="text-sm opacity-90">الوحدة الثالثة — الدرس الثامن</p>
          <h1 className="font-heading text-3xl font-black leading-tight drop-shadow sm:text-4xl">{LESSON_TITLE}</h1>
        </div>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-3">
        <div className="rounded-3xl bg-gradient-to-l from-saudi to-saudi-dark p-5 text-white shadow-lg">
          <p className="text-lg">
            أهلاً بك يا <span className="font-heading font-extrabold text-gold">{session.name}</span> من فصل{" "}
            <span className="font-heading font-extrabold text-gold">{session.className}</span> 👋
          </p>
          <p className="mt-1 text-sm text-white/80">{LESSON_SUBTITLE}</p>
        </div>
        <div className="rounded-3xl bg-maroon-light p-5 ring-2 ring-maroon/20">
          <h3 className="mb-2 flex items-center gap-2 font-heading text-lg font-extrabold text-maroon">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-maroon text-white">؟</span>
            سؤال الدرس
          </h3>
          <p className="text-lg font-bold leading-relaxed text-maroon-dark">{BIG_QUESTION}</p>
        </div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/5">
          <h3 className="mb-3 font-heading text-lg font-extrabold text-saudi">🎯 أهداف الدرس</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {OBJECTIVES.map((o, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-sand/70 p-3 text-base leading-relaxed">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-saudi text-xs font-bold text-white">{i + 1}</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
        <button className="btn-primary self-start text-lg" onClick={() => { playSound("click"); next?.(); }}>
          ابدأ الدرس 🚀
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------- KWL ---------------------------------- */
const KWL_KNOW_SHUFFLABLE = KWL_KNOW_OPTIONS.filter((o) => o !== KWL_KNOW_NONE);
export function KwlSlide({ value, update, done, markDone }: SlideProps) {
  const knowShuffled = useShuffled(KWL_KNOW_SHUFFLABLE);
  const knowOptions = [...knowShuffled, KWL_KNOW_NONE]; // "I know nothing" always last
  const wantOptions = useShuffled(KWL_WANT_OPTIONS);
  const know = arr<string>(value.know);
  const want = arr<string>(value.want);
  useEffect(() => {
    if (!done && know.length > 0 && want.length > 0) {
      playSound("success");
      markDone();
    }
  }, [know.length, want.length, done, markDone]);

  const toggleKnow = (t: string) => {
    playSound("click");
    let next = know.includes(t) ? know.filter((x) => x !== t) : [...know, t];
    if (t === KWL_KNOW_NONE && !know.includes(t)) next = [KWL_KNOW_NONE];
    else next = next.filter((x) => x !== KWL_KNOW_NONE || t === KWL_KNOW_NONE);
    update({ know: next });
  };
  const toggleWant = (t: string) => {
    playSound("click");
    update({ want: want.includes(t) ? want.filter((x) => x !== t) : [...want, t] });
  };

  return (
    <div className="grid gap-5">
      <div className="rounded-3xl bg-maroon-light p-4 ring-2 ring-maroon/20 sm:p-5">
        <h3 className="font-heading text-xl font-extrabold text-maroon">🔥 عصف ذهني</h3>
        <p className="mt-1 text-lg font-bold leading-relaxed text-maroon-dark">{BIG_QUESTION}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <h4 className="mb-1 font-heading text-lg font-extrabold text-saudi sm:text-xl">K — ماذا أعرف؟</h4>
          <p className="mb-3 text-sm text-ink/60">اختر كل ما تعرفه مسبقاً عن الدولة السعودية الثانية ({know.length} مختار):</p>
          <ChoiceList options={knowOptions.map((text) => ({ text }))} selected={know} onToggle={toggleKnow} />
        </div>
        <div className="card p-4 sm:p-5">
          <h4 className="mb-1 font-heading text-lg font-extrabold text-navy sm:text-xl">W — ماذا أريد أن أعرف؟</h4>
          <p className="mb-3 text-sm text-ink/60">اختر الأسئلة التي تريد الإجابة عنها في هذا الدرس ({want.length} مختار):</p>
          <ChoiceList options={wantOptions.map((text) => ({ text }))} selected={want} onToggle={toggleWant} />
        </div>
      </div>
      <div className="rounded-2xl bg-white/70 p-3 text-base text-ink/60 ring-1 ring-black/5">
        ℹ️ سنعود إلى هذا الجدول في نهاية الدرس لنختار <b>L — ماذا تعلمت؟</b>
      </div>
      {done && <DoneBanner>رائع! سجلت أفكارك الأولى. يمكنك المتابعة.</DoneBanner>}
    </div>
  );
}

/* ---------------------------- Reading: Faisal ---------------------------- */
function KeywordText({ text, seen, onSeen }: { text: string; seen: string[]; onSeen: (k: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  const keys = Object.keys(FAISAL_KEYWORDS);
  const parts: Array<{ t: string; k?: string }> = [];
  let rest = text;
  while (rest.length) {
    let nearest: { idx: number; k: string } | null = null;
    for (const k of keys) {
      const idx = rest.indexOf(k);
      if (idx >= 0 && (!nearest || idx < nearest.idx)) nearest = { idx, k };
    }
    if (!nearest) {
      parts.push({ t: rest });
      break;
    }
    if (nearest.idx > 0) parts.push({ t: rest.slice(0, nearest.idx) });
    parts.push({ t: nearest.k, k: nearest.k });
    rest = rest.slice(nearest.idx + nearest.k.length);
  }
  return (
    <div>
      <p className="text-xl leading-[2.2] text-ink">
        {parts.map((p, i) =>
          p.k ? (
            <button
              key={i}
              type="button"
              onClick={() => { playSound("click"); setActive(active === p.k ? null : p.k!); onSeen(p.k!); }}
              className={cx("mx-0.5 rounded-lg px-1.5 font-bold underline decoration-dotted underline-offset-4 transition", seen.includes(p.k) ? "bg-saudi-light text-saudi" : "bg-gold-light text-amber-900")}
            >
              {p.t}
            </button>
          ) : (
            <span key={i}>{p.t}</span>
          ),
        )}
      </p>
      {active && (
        <div className="pop mt-2 rounded-2xl bg-navy p-3 text-white">
          <b className="text-gold">{active}:</b> {FAISAL_KEYWORDS[active]}
        </div>
      )}
    </div>
  );
}

export function ReadingFaisalSlide({ value, update, done, markDone }: SlideProps) {
  const seen = arr<string>(value.seen);
  const chosen = typeof value.chosen === "number" ? (value.chosen as number) : null;
  const text =
    "تولى الإمام فيصل بن تركي الحكم بعد وفاة والده، فعادت في عهده الحملات العثمانية المعتدية إلى الرياض بقيادة إسماعيل آغا عام ١٢٥٠هـ، وخرج الإمام فيصل بن تركي إلى الأحساء؛ للإعداد لمواجهتها.";
  return (
    <div className="grid gap-5">
      <div className="card p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="chip bg-saudi text-white">📖 اقرأ بتمعّن</span>
          <span className="text-sm text-ink/60">اضغط على الكلمات الملوّنة لتعرف معناها ({seen.length}/{Object.keys(FAISAL_KEYWORDS).length})</span>
        </div>
        <KeywordText text={text} seen={seen} onSeen={(k) => !seen.includes(k) && update({ seen: [...seen, k] })} />
      </div>
      <McqCheck
        question={FAISAL_CHECK.question}
        options={FAISAL_CHECK.options}
        answer={FAISAL_CHECK.answer}
        chosen={chosen}
        onChoose={(i, ok) => {
          playSound(ok ? "correct" : "wrong");
          update({ chosen: i });
          if (ok && !done) markDone();
        }}
      />
      {done && <DoneBanner />}
    </div>
  );
}

/* --------------------------------- Battle -------------------------------- */
export function BattleSlide({ value, update, done, markDone }: SlideProps) {
  const answers = arr<number | null>(value.answers);
  const solvedCount = BATTLE_QUESTIONS.filter((q, i) => answers[i] === q.answer).length;
  const [current, setCurrent] = useState(() => {
    const firstUnsolved = BATTLE_QUESTIONS.findIndex((q, i) => answers[i] !== q.answer);
    return firstUnsolved === -1 ? BATTLE_QUESTIONS.length - 1 : firstUnsolved;
  });
  const q = BATTLE_QUESTIONS[current];
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="grid gap-4 lg:col-span-3">
        <div className="card p-5 sm:p-6">
          <h3 className="mb-3 font-heading text-xl font-extrabold text-maroon">⚔️ معركة الحُلوة سنة ١٢٥٣هـ</h3>
          <div className="space-y-3 text-lg leading-[2]">
            <p>لم يتقبل السعوديون النفوذ الأجنبي، فقاوموا الاعتداء العثماني وكبّدوه خسائر كبيرة.</p>
            <p>ومن أبرز المعارك التي سجلها التاريخ البطولي للسعوديين ضد القوات المعتدية بقيادة إسماعيل آغا <b className="text-maroon">معركة الحُلوة</b>.</p>
            <p>ويسمي الأهالي هذه المعركة بـ<b className="text-maroon">معركة الرُّوم</b>؛ لكثرة مَن قُتل فيها من القوات المعتدية.</p>
            <p>بعد هزيمة القوات المعتدية في معركة الحُلوة، جاءت تعزيزات جديدة للأعداء قائدها <b>خورشيد باشا</b> لفرض النفوذ والسيطرة، والانتقام مما حلّ بقواتهم من هزائم.</p>
          </div>
        </div>
        <InfoBox>الحُلوة إحدى مراكز محافظة حوطة بني تميم في منطقة الرياض.</InfoBox>
      </div>
      <div className="grid content-start gap-4 lg:col-span-2">
        <figure className="overflow-hidden rounded-3xl ring-1 ring-black/10">
          <div className="relative h-44">
            <LessonImage src="/images/hulwa-fort.jpg" alt="قلعة الإمام تركي بن عبدالله في الحلوة" fill className="object-cover" />
          </div>
          <figcaption className="bg-navy px-3 py-2 text-center text-sm font-bold text-white">قلعة الإمام تركي بن عبدالله في الحُلوة</figcaption>
        </figure>
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-heading font-extrabold text-saudi">أسئلة سابرة</span>
            <div className="flex gap-1">
              {BATTLE_QUESTIONS.map((bq, i) => (
                <button key={i} onClick={() => setCurrent(i)} className={cx("h-3 w-6 rounded-full transition", answers[i] === bq.answer ? "bg-emerald-500" : i === current ? "bg-saudi" : "bg-sand-dark")} aria-label={`سؤال ${i + 1}`} />
              ))}
            </div>
          </div>
          <McqCheck
            key={current}
            question={q.q}
            options={q.options}
            answer={q.answer}
            hint={q.hint}
            chosen={answers[current] ?? null}
            onChoose={(i, ok) => {
              playSound(ok ? "correct" : "wrong");
              const nextAns = [...answers];
              while (nextAns.length < BATTLE_QUESTIONS.length) nextAns.push(null);
              nextAns[current] = i;
              update({ answers: nextAns });
              const solvedNow = BATTLE_QUESTIONS.filter((bq, j) => nextAns[j] === bq.answer).length;
              if (ok && current < BATTLE_QUESTIONS.length - 1) setTimeout(() => setCurrent(current + 1), 900);
              if (solvedNow === BATTLE_QUESTIONS.length && !done) {
                playSound("success");
                markDone();
              }
            }}
          />
          <p className="mt-2 text-center text-xs text-ink/50">أجبت بشكل صحيح عن {solvedCount} من {BATTLE_QUESTIONS.length}</p>
        </div>
        {done && <DoneBanner />}
      </div>
    </div>
  );
}

/* --------------------------------- Story --------------------------------- */
export function StorySlide({ value, update, done, markDone }: SlideProps) {
  const [scene, setScene] = useState(num(value.scene, 0));
  const chosen = typeof value.chosen === "number" ? (value.chosen as number) : null;
  const s = STORY_SCENES[scene];
  const finished = scene >= STORY_SCENES.length - 1;
  const go = (i: number) => {
    playSound("click");
    setScene(i);
    update({ scene: Math.max(i, num(value.scene, 0)) });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="relative min-h-[280px] overflow-hidden rounded-3xl ring-1 ring-black/10">
        <LessonImage src="/images/escape.jpg" alt="الهروب من السجن" fill className="object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
          <p className="text-sm opacity-90">قصة تفاعلية</p>
          <h3 className="font-heading text-2xl font-black">عودة الإمام فيصل بن تركي إلى الرياض</h3>
        </div>
      </div>
      <div className="grid content-start gap-4">
        <div key={scene} className="card slide-enter p-5">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-4xl">{s.emoji}</span>
            <div>
              <p className="text-xs text-ink/50">المشهد {scene + 1} من {STORY_SCENES.length}</p>
              <h4 className="font-heading text-xl font-extrabold text-saudi">{s.title}</h4>
            </div>
          </div>
          <p className="text-lg leading-[2]">{s.text}</p>
          <div className="mt-4 flex items-center justify-between">
            <button className="btn-secondary" disabled={scene === 0} onClick={() => go(scene - 1)}>
              ◀ السابق
            </button>
            <div className="flex gap-1">
              {STORY_SCENES.map((_, i) => (
                <span key={i} className={cx("h-2.5 w-2.5 rounded-full", i === scene ? "bg-saudi" : i < scene ? "bg-saudi/40" : "bg-sand-dark")} />
              ))}
            </div>
            <button className="btn-primary" disabled={finished} onClick={() => go(scene + 1)}>
              التالي ▶
            </button>
          </div>
        </div>
        {(finished || num(value.scene, 0) >= STORY_SCENES.length - 1) && (
          <McqCheck
            question={STORY_CHECK.question}
            options={STORY_CHECK.options}
            answer={STORY_CHECK.answer}
            chosen={chosen}
            onChoose={(i, ok) => {
              playSound(ok ? "correct" : "wrong");
              update({ chosen: i });
              if (ok && !done) markDone();
            }}
          />
        )}
        {done && <DoneBanner />}
      </div>
    </div>
  );
}

/* -------------------------------- Abdullah -------------------------------- */
export function AbdullahSlide({ value, update, done, markDone }: SlideProps) {
  const flipped = arr<number>(value.flipped);
  const flip = (i: number) => {
    playSound("flip");
    if (flipped.includes(i)) return;
    const nextF = [...flipped, i];
    update({ flipped: nextF });
    if (nextF.length === ABDULLAH_CARDS.length && !done) {
      playSound("success");
      markDone();
    }
  };
  const [open, setOpen] = useState<number[]>(flipped);
  const toggle = (i: number) => {
    setOpen((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
    flip(i);
  };
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <h3 className="mb-2 font-heading text-xl font-extrabold text-saudi">👑 الإمام عبدالله بن فيصل بن تركي</h3>
          <p className="text-lg leading-[2]">
            تولى الإمام عبدالله بن فيصل بن تركي الحكم بعد وفاة والده عام <b className="text-maroon">١٢٨٢هـ</b>، فواصل مسيرة بناء الدولة.
          </p>
          <p className="mt-2 text-sm text-ink/60">اقلب البطاقات الأربع لتكتشف أبرز أحداث عهده ({flipped.length}/{ABDULLAH_CARDS.length}).</p>
        </div>
        <figure className="overflow-hidden rounded-3xl ring-1 ring-black/10 lg:col-span-2">
          <div className="relative h-40">
            <LessonImage src="/images/old-riyadh.jpg" alt="مدينة الرياض قديماً" fill className="object-cover" />
          </div>
          <figcaption className="bg-navy px-3 py-2 text-center text-sm font-bold text-white">مدينة الرياض قديماً</figcaption>
        </figure>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ABDULLAH_CARDS.map((c, i) => {
          const isOpen = open.includes(i);
          return (
            <button key={i} type="button" onClick={() => toggle(i)} className={cx("flip-card h-52 text-start", isOpen && "flipped")}>
              <div className="flip-inner h-full w-full">
                <div className="flip-face flex flex-col items-center justify-center gap-3 rounded-3xl bg-gradient-to-br from-saudi to-saudi-dark p-4 text-white shadow-lg">
                  <span className="text-5xl">{c.emoji}</span>
                  <span className="font-heading text-xl font-extrabold">{c.front}</span>
                  <span className="text-xs opacity-80">اضغط للقلب</span>
                </div>
                <div className="flip-face flip-back flex items-center justify-center rounded-3xl bg-white p-4 text-center ring-2 ring-saudi">
                  <p className="text-base leading-relaxed">{c.back}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {done && <DoneBanner />}
    </div>
  );
}

/* --------------------------------- Values --------------------------------- */
export function ValuesSlide({ value, update, done, markDone }: SlideProps) {
  const valueOptions = useShuffled(VALUES_OPTIONS);
  const behaviorOptions = useShuffled(RESPECT_BEHAVIORS);
  const selected = arr<string>(value.selected);
  const checked = Boolean(value.checked);
  const behaviors = arr<string>(value.behaviors);
  const correctSet = VALUES_OPTIONS.filter((v) => v.correct).map((v) => v.text);
  const isCorrect = checked && selected.length === correctSet.length && correctSet.every((c) => selected.includes(c));
  const toggle = (t: string) => {
    playSound("click");
    update({ selected: selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t], checked: false });
  };
  const check = () => {
    const ok = selected.length === correctSet.length && correctSet.every((c) => selected.includes(c));
    playSound(ok ? "success" : "wrong");
    update({ checked: true });
    if (ok && !done) markDone();
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <InfoBox>
          كانت تربية الإمام عبدالرحمن لأبنائه وبناته تقوم على القيم العربية والإسلامية، ومن أبرزها احترام الوالدين وتقديرهما والتواضع أمامهما.
        </InfoBox>
        <div className="rounded-3xl bg-gradient-to-br from-navy to-[#1d3047] p-5 text-white shadow-lg">
          <p className="mb-2 text-sm text-gold">قال محمد أسد:</p>
          <p className="text-lg leading-[2]">{ASAD_QUOTE}</p>
        </div>
      </div>
      <div className="grid content-start gap-4">
        <div className="card p-5">
          <h4 className="mb-1 font-heading text-lg font-extrabold text-saudi">💚 ما القيم التي ظهرت في موقف الملك عبدالعزيز مع والده؟</h4>
          <p className="mb-3 text-sm text-ink/60">اختر كل القيم الصحيحة ثم اضغط «تحقق».</p>
          <div className="flex flex-wrap gap-2">
            {valueOptions.map((o) => {
              const sel = selected.includes(o.text);
              const state = checked ? (sel && o.correct ? "ok" : sel && !o.correct ? "bad" : !sel && o.correct ? "missed" : "none") : sel ? "sel" : "none";
              return (
                <button
                  key={o.text}
                  onClick={() => toggle(o.text)}
                  className={cx(
                    "rounded-2xl border-2 px-4 py-2 text-base font-bold transition",
                    state === "none" && "border-sand-dark bg-white hover:border-saudi",
                    state === "sel" && "border-saudi bg-saudi-light text-saudi",
                    state === "ok" && "border-emerald-500 bg-emerald-50 text-emerald-800",
                    state === "bad" && "border-rose-400 bg-rose-50 text-rose-800 line-through",
                    state === "missed" && "border-amber-400 bg-amber-50 text-amber-800",
                  )}
                >
                  {state === "ok" && "✓ "}
                  {o.text}
                </button>
              );
            })}
          </div>
          <button className="btn-primary mt-4" onClick={check} disabled={selected.length === 0}>
            تحقق ✔
          </button>
          {checked && !isCorrect && <div className="mt-3"><Feedback kind="wrong">راجع اختياراتك: القيم المطلوبة هي ما يتعلق بالوالدين والتواضع فقط.</Feedback></div>}
          {isCorrect && <div className="mt-3"><Feedback kind="correct">أحسنت! احترام الوالدين وتقديرهما والتواضع أمامهما من أبرز القيم التي تربّى عليها الملك عبدالعزيز.</Feedback></div>}
        </div>
        <div className="card p-4 sm:p-5">
          <h4 className="mb-1 font-heading text-lg font-extrabold text-navy">✍️ تأمّل: ما السلوكيات التي تدل على احترامك لوالديك؟</h4>
          <p className="mb-3 text-sm text-ink/60">اختر السلوكيات الصحيحة (تظهر النتيجة فور الاختيار):</p>
          <ChoiceList
            options={behaviorOptions}
            selected={behaviors}
            reveal="selected"
            onToggle={(t) => {
              const ok = RESPECT_BEHAVIORS.find((b) => b.text === t)?.correct;
              const adding = !behaviors.includes(t);
              playSound(adding ? (ok ? "correct" : "wrong") : "click");
              update({ behaviors: adding ? [...behaviors, t] : behaviors.filter((x) => x !== t) });
            }}
          />
          {behaviors.some((t) => RESPECT_BEHAVIORS.find((b) => b.text === t && !b.correct)) && (
            <div className="mt-3">
              <Feedback kind="wrong">السلوكيات الحمراء لا تدل على احترام الوالدين؛ تذكّر تواضع الملك عبدالعزيز أمام والده.</Feedback>
            </div>
          )}
        </div>
        {done && <DoneBanner />}
      </div>
    </div>
  );
}
