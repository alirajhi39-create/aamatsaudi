"use client";

import { useState } from "react";
import {
  CAUSES_OPTIONS,
  CAUSE_EFFECT_PAIRS,
  CLASSIFY_GROUPS,
  CLASSIFY_ITEMS,
  IMAMS,
  MATCH_PAIRS,
  MINDMAP_BANK,
  MINDMAP_BRANCHES,
  TF_ITEMS,
} from "@/lib/lesson-content";
import { playSound } from "@/lib/sound";
import { DoneBanner, Feedback, InfoBox, cx } from "@/components/ui";
import { arr, rec, type SlideProps } from "./types";
import { usePerm, useShuffled } from "./useShuffle";

/* -------------------------------- Timeline -------------------------------- */
export function TimelineSlide({ value, update, done, markDone, session }: SlideProps) {
  const explored = arr<string>(value.explored);
  const [active, setActive] = useState<string>(explored[explored.length - 1] ?? "");
  const imam = IMAMS.find((i) => i.id === active);
  const open = (id: string) => {
    playSound("click");
    setActive(id);
    if (!explored.includes(id)) {
      const nextE = [...explored, id];
      update({ explored: nextE });
      if (nextE.length === IMAMS.length && !done) {
        playSound("success");
        markDone();
      }
    }
  };
  return (
    <div className="grid gap-6">
      <div className="card p-5">
        <p className="text-base text-ink/70">
          مرحباً {session.name.split(" ")[0]}! اضغط على كل إمام في الخط الزمني لتكتشف جهوده ({explored.length}/{IMAMS.length}).
        </p>
      </div>
      <div className="timeline-line relative grid grid-cols-2 gap-4 px-2 sm:grid-cols-4">
        {IMAMS.map((im, idx) => {
          const seen = explored.includes(im.id);
          const isActive = active === im.id;
          return (
            <button key={im.id} onClick={() => open(im.id)} className="relative z-10 flex flex-col items-center gap-2">
              <span
                className={cx(
                  "flex h-20 w-20 items-center justify-center rounded-full border-4 bg-white font-heading text-sm font-extrabold leading-tight shadow-md transition-all sm:h-24 sm:w-24",
                  isActive ? "scale-110 text-white" : seen ? "text-ink" : "text-ink/60",
                )}
                style={{ borderColor: im.color, background: isActive ? im.color : seen ? "#fff" : "#fff" }}
              >
                {idx + 1}
                <span className="sr-only">{im.name}</span>
              </span>
              <span className={cx("text-center font-heading text-sm font-bold leading-tight sm:text-base", seen ? "text-ink" : "text-ink/50")}>{im.name}</span>
              {seen && <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">✓ تم</span>}
            </button>
          );
        })}
      </div>
      {imam ? (
        <div key={imam.id} className="card slide-enter p-5 sm:p-6" style={{ borderInlineStart: `8px solid ${imam.color}` }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-2xl font-black" style={{ color: imam.color }}>
              {imam.name}
            </h3>
            <span className="chip bg-sand text-ink/80">{imam.years}</span>
          </div>
          <p className="mt-3 text-lg leading-[2]">{imam.brief}</p>
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-saudi/40 p-8 text-center text-ink/50">👆 اختر إماماً من الخط الزمني</div>
      )}
      {done && <DoneBanner>ممتاز! تعرفت على أئمة الدولة السعودية الثانية الأربعة بالترتيب.</DoneBanner>}
    </div>
  );
}

/* ------------------------------ Cause / Effect ------------------------------ */
export function CauseEffectSlide({ value, update, done, markDone }: SlideProps) {
  const links = rec(value.links); // causeId -> effectId
  const [selectedCause, setSelectedCause] = useState<string | null>(null);
  const [wrongFlash, setWrongFlash] = useState<string | null>(null);
  const effects = useShuffled(CAUSE_EFFECT_PAIRS); // new random order every time the slide opens
  const pick = (effectId: string) => {
    if (!selectedCause) return;
    if (effectId === selectedCause) {
      playSound("correct");
      const nextLinks = { ...links, [selectedCause]: effectId };
      update({ links: nextLinks });
      setSelectedCause(null);
      if (Object.keys(nextLinks).length === CAUSE_EFFECT_PAIRS.length && !done) {
        playSound("success");
        markDone();
      }
    } else {
      playSound("wrong");
      setWrongFlash(effectId);
      setTimeout(() => setWrongFlash(null), 500);
    }
  };
  return (
    <div className="grid gap-5">
      <div className="card p-5">
        <h3 className="mb-2 font-heading text-xl font-extrabold text-maroon">🔗 أَسْر الإمام فيصل بن تركي</h3>
        <div className="space-y-2 text-lg leading-[2]">
          <p>عاد الإمام فيصل بن تركي من الأحساء لمواجهة الأعداء وإعادة الاستقرار للدولة السعودية.</p>
          <p>
            ولكن عندما وصلت حملة جديدة بقوات كبيرة بقيادة <b>(خورشيد بك)</b>، تمكنت من أَسْر الإمام فيصل بن تركي الذي استسلم <b className="text-maroon">حَقْناً لدماء المواطنين</b>، ونُقل إلى مصر حيث سُجن هناك في قلعة حصينة.
          </p>
        </div>
      </div>
      <p className="text-center text-sm font-bold text-ink/60">اضغط على السبب (يمين) ثم اضغط على النتيجة المناسبة له (يسار)</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <div className="grid gap-3">
          <h4 className="rounded-2xl bg-maroon py-2 text-center font-heading font-extrabold text-white">السبب</h4>
          {CAUSE_EFFECT_PAIRS.map((p) => {
            const linked = Boolean(links[p.id]);
            return (
              <button
                key={p.id}
                disabled={linked}
                onClick={() => { playSound("click"); setSelectedCause(p.id); }}
                className={cx(
                  "rounded-2xl border-2 p-3 text-start text-base font-medium leading-relaxed transition sm:text-lg",
                  linked ? "border-emerald-400 bg-emerald-50 text-emerald-900" : selectedCause === p.id ? "border-maroon bg-maroon-light ring-4 ring-maroon/15" : "border-sand-dark bg-white hover:border-maroon",
                )}
              >
                {linked && "✓ "}
                {p.cause}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3">
          <h4 className="rounded-2xl bg-saudi py-2 text-center font-heading font-extrabold text-white">النتيجة</h4>
          {effects.map((p) => {
            const linked = Object.values(links).includes(p.id);
            return (
              <button
                key={p.id}
                disabled={linked || !selectedCause}
                onClick={() => pick(p.id)}
                className={cx(
                  "rounded-2xl border-2 p-3 text-start text-base font-medium leading-relaxed transition sm:text-lg",
                  linked ? "border-emerald-400 bg-emerald-50 text-emerald-900" : wrongFlash === p.id ? "shake border-rose-400 bg-rose-50" : selectedCause ? "border-saudi/50 bg-white hover:border-saudi hover:bg-saudi-light" : "border-sand-dark bg-white/70",
                )}
              >
                {linked && "✓ "}
                {p.effect}
              </button>
            );
          })}
        </div>
      </div>
      {done && <DoneBanner>أحسنت! ربطت كل سبب بنتيجته بشكل صحيح.</DoneBanner>}
    </div>
  );
}

/* --------------------------------- Causes --------------------------------- */
export function CausesSlide({ value, update, done, markDone }: SlideProps) {
  const causeOptions = useShuffled(CAUSES_OPTIONS);
  const selected = arr<string>(value.selected);
  const checked = Boolean(value.checked);
  const correctSet = CAUSES_OPTIONS.filter((c) => c.correct).map((c) => c.text);
  const isCorrect = selected.length === correctSet.length && correctSet.every((c) => selected.includes(c));
  const toggle = (t: string) => {
    playSound("click");
    update({ selected: selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t], checked: false });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <div className="card p-5">
          <h3 className="mb-2 font-heading text-xl font-extrabold text-maroon">🔍 عانى الإمام عبدالله بن فيصل...</h3>
          <p className="text-lg leading-[2]">
            عانى الإمام عبدالله بن فيصل بن تركي تلك الخلافات الداخلية، وظهور <b>محمد بن رشيد</b> ـ أمير حائل الذي عيّنه الإمام فيصل بن تركي عليها ـ الذي استغل الفوضى وضعف الأوضاع للاستيلاء على الحكم. توفي الإمام عبدالله بن فيصل بن تركي ـ رحمه الله ـ عام <b className="text-maroon">١٣٠٧هـ</b> في الرياض.
          </p>
        </div>
        <InfoBox>
          فقدت الدولة السعودية الثانية نفوذها في عدد من المناطق التي تمكن الإمام تركي بن عبدالله وابنه الإمام فيصل بن تركي من توحيدها؛ وذلك نتيجة لعوامل الخلافات والأطماع الشخصية لدى بعض الزعماء المحليين، وأطماع الأعداء في مناطق الدولة السعودية الثانية.
        </InfoBox>
      </div>
      <div className="card p-5">
        <h4 className="font-heading text-lg font-extrabold text-saudi">لماذا فقدت الدولة السعودية الثانية نفوذها في عدد من المناطق؟</h4>
        <p className="mb-3 text-sm text-ink/60">اختر الأسباب الصحيحة (ثلاثة أسباب) ثم اضغط «تحقق».</p>
        <div className="grid gap-2">
          {causeOptions.map((o) => {
            const sel = selected.includes(o.text);
            const state = checked ? (sel && o.correct ? "ok" : sel && !o.correct ? "bad" : !sel && o.correct ? "missed" : "none") : sel ? "sel" : "none";
            return (
              <button
                key={o.text}
                onClick={() => toggle(o.text)}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start text-base font-medium transition",
                  state === "none" && "border-sand-dark bg-white hover:border-saudi",
                  state === "sel" && "border-saudi bg-saudi-light",
                  state === "ok" && "border-emerald-500 bg-emerald-50 text-emerald-900",
                  state === "bad" && "border-rose-400 bg-rose-50 text-rose-900",
                  state === "missed" && "border-amber-400 bg-amber-50 text-amber-900",
                )}
              >
                <span className={cx("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-sm font-bold", sel ? "border-saudi bg-saudi text-white" : "border-sand-dark bg-white")}>{sel ? "✓" : ""}</span>
                <span className="flex-1">{o.text}</span>
                {state === "bad" && <span className="text-xs">ليس سبباً</span>}
                {state === "missed" && <span className="text-xs">سبب فاتك</span>}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary mt-4"
          disabled={selected.length === 0}
          onClick={() => {
            playSound(isCorrect ? "success" : "wrong");
            update({ checked: true });
            if (isCorrect && !done) markDone();
          }}
        >
          تحقق ✔
        </button>
        {checked && !isCorrect && <div className="mt-3"><Feedback kind="wrong">راجع فقرة «للاطلاع» وحاول مرة أخرى.</Feedback></div>}
        {checked && isCorrect && <div className="mt-3"><DoneBanner>أحسنت! حددت الأسباب الثلاثة بدقة.</DoneBanner></div>}
      </div>
    </div>
  );
}

/* -------------------------------- Classify -------------------------------- */
export function ClassifySlide({ value, update, done, markDone }: SlideProps) {
  const placed = rec(value.placed); // text -> groupId
  const [selected, setSelected] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const classifyItems = useShuffled(CLASSIFY_ITEMS);
  const remaining = classifyItems.filter((i) => !placed[i.text]);
  const drop = (groupId: string) => {
    if (!selected) return;
    const item = CLASSIFY_ITEMS.find((i) => i.text === selected);
    if (!item) return;
    if (item.group === groupId) {
      playSound("correct");
      const nextP = { ...placed, [selected]: groupId };
      update({ placed: nextP });
      setSelected(null);
      if (Object.keys(nextP).length === CLASSIFY_ITEMS.length && !done) {
        playSound("success");
        markDone();
      }
    } else {
      playSound("wrong");
      setWrong(groupId);
      setTimeout(() => setWrong(null), 500);
    }
  };
  return (
    <div className="grid gap-5">
      <div className="card p-5">
        <h3 className="mb-2 font-heading text-xl font-extrabold text-saudi">👑 الإمام عبدالرحمن بن فيصل بن تركي</h3>
        <div className="space-y-2 text-lg leading-[2]">
          <p>تولى الإمام عبدالرحمن بن فيصل بن تركي الحكم في الدولة السعودية الثانية عام <b className="text-maroon">١٢٩١هـ</b>، وبذل جهوده لإعادة الاستقرار في الدولة السعودية الثانية.</p>
          <p>وعُرف الإمام عبدالرحمن بن فيصل بن تركي بالحكمة والشجاعة والمحافظة على تماسك الأسرة. كما عُرف عنه اطلاعه الواسع في مجالات المعرفة مثل: الدين، واللغة، والتراث، والطب النبوي.</p>
        </div>
      </div>
      <div className="card p-4">
        <p className="mb-2 text-sm font-bold text-ink/60">🧩 اضغط على كلمة ثم اضغط على المجموعة المناسبة لها:</p>
        <div className="flex min-h-12 flex-wrap gap-2">
          {remaining.length === 0 && <span className="text-sm text-emerald-700">تم تصنيف جميع الكلمات ✓</span>}
          {remaining.map((i) => (
            <button key={i.text} onClick={() => { playSound("click"); setSelected(i.text); }} className={cx("rounded-2xl border-2 px-4 py-2 font-bold transition", selected === i.text ? "border-saudi bg-saudi text-white" : "border-sand-dark bg-white hover:border-saudi")}>
              {i.text}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {CLASSIFY_GROUPS.map((g) => (
          <button
            key={g.id}
            onClick={() => drop(g.id)}
            className={cx(
              "min-h-40 rounded-3xl border-4 border-dashed p-4 text-start transition",
              wrong === g.id ? "shake border-rose-400 bg-rose-50" : selected ? "border-saudi bg-saudi-light/60 hover:bg-saudi-light" : "border-sand-dark bg-white/70",
            )}
          >
            <h4 className="mb-2 font-heading text-lg font-extrabold text-saudi">
              {g.icon} {g.label}
            </h4>
            <div className="flex flex-wrap gap-2">
              {CLASSIFY_ITEMS.filter((i) => placed[i.text] === g.id).map((i) => (
                <span key={i.text} className="chip pop bg-emerald-100 text-emerald-800">✓ {i.text}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
      {done && <DoneBanner />}
    </div>
  );
}

/* --------------------------------- Mindmap --------------------------------- */
export function MindmapSlide({ value, update, done, markDone }: SlideProps) {
  const bank = useShuffled(MINDMAP_BANK);
  const filled = rec(value.filled); // blankId -> word
  const checked = Boolean(value.checked);
  const [activeBlank, setActiveBlank] = useState<string | null>(null);
  const allBlanks = MINDMAP_BRANCHES.flatMap((b) => b.blanks);
  const allCorrect = allBlanks.every((b) => filled[b.id] === b.answer);
  const usedWords = Object.values(filled);
  const fill = (word: string) => {
    if (!activeBlank) return;
    playSound("click");
    update({ filled: { ...filled, [activeBlank]: word }, checked: false });
    const nextBlank = allBlanks.find((b) => b.id !== activeBlank && !{ ...filled, [activeBlank]: word }[b.id]);
    setActiveBlank(nextBlank?.id ?? null);
  };
  const clear = (id: string) => {
    const nextF = { ...filled };
    delete nextF[id];
    update({ filled: nextF, checked: false });
    setActiveBlank(id);
  };
  return (
    <div className="grid gap-5">
      <div className="rounded-3xl bg-gradient-to-l from-saudi to-saudi-dark p-4 text-center text-white shadow-lg">
        <h3 className="font-heading text-2xl font-black">🌳 أئمة الدولة السعودية الثانية</h3>
        <p className="text-sm text-white/80">اضغط على الفراغ ثم اختر الكلمة المناسبة من البنك</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {MINDMAP_BRANCHES.map((b) => (
          <div key={b.title} className="card p-4" style={{ borderTop: `8px solid ${b.color}` }}>
            <h4 className="mb-3 text-center font-heading text-lg font-extrabold" style={{ color: b.color }}>{b.title}</h4>
            <ul className="grid gap-2">
              {b.blanks.map((bl) => {
                const w = filled[bl.id];
                const ok = checked && w === bl.answer;
                const bad = checked && w && w !== bl.answer;
                return (
                  <li key={bl.id} className="rounded-2xl bg-sand/70 p-2 text-base leading-relaxed">
                    {bl.before}{" "}
                    <button
                      onClick={() => (w && !done ? clear(bl.id) : setActiveBlank(bl.id))}
                      className={cx(
                        "mx-1 inline-block min-w-20 rounded-xl border-2 px-2 py-0.5 font-bold transition",
                        ok ? "border-emerald-500 bg-emerald-50 text-emerald-800" : bad ? "border-rose-400 bg-rose-50 text-rose-800" : activeBlank === bl.id ? "border-saudi bg-saudi-light ring-4 ring-saudi/15" : w ? "border-navy/40 bg-white text-navy" : "border-dashed border-ink/30 bg-white text-ink/40",
                      )}
                    >
                      {w || "؟"}
                    </button>{" "}
                    {bl.after}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <p className="mb-2 text-sm font-bold text-ink/60">🏦 بنك الكلمات {activeBlank ? "(اختر كلمة للفراغ المحدد)" : "(حدد فراغاً أولاً)"}</p>
        <div className="flex flex-wrap gap-2">
          {bank.map((w) => {
            const used = usedWords.includes(w);
            return (
              <button key={w} disabled={used || !activeBlank || done} onClick={() => fill(w)} className={cx("rounded-2xl border-2 px-4 py-2 font-bold transition", used ? "border-sand-dark bg-sand text-ink/30 line-through" : "border-saudi/40 bg-white hover:border-saudi hover:bg-saudi-light disabled:opacity-50")}>
                {w}
              </button>
            );
          })}
        </div>
        {!done && (
          <button
            className="btn-primary mt-4"
            disabled={Object.keys(filled).length < allBlanks.length}
            onClick={() => {
              playSound(allCorrect ? "success" : "wrong");
              update({ checked: true });
              if (allCorrect) markDone();
            }}
          >
            تحقق ✔
          </button>
        )}
        {checked && !allCorrect && <div className="mt-3"><Feedback kind="wrong">هناك فراغات غير صحيحة (باللون الأحمر). اضغط عليها لتفريغها واختر كلمة أخرى.</Feedback></div>}
        {done && <div className="mt-3"><DoneBanner>رائع! اكتملت الخريطة الذهنية للدرس.</DoneBanner></div>}
      </div>
    </div>
  );
}

/* --------------------------------- Matching -------------------------------- */
const PAIR_COLORS = ["#0f6e56", "#a0353f", "#2f4b6e", "#d4a443", "#7c3aed", "#0891b2"];
export function MatchingSlide({ value, update, done, markDone }: SlideProps) {
  const links = rec(value.links); // leftId -> rightId
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const rights = useShuffled(MATCH_PAIRS); // shuffled again on every visit
  const pick = (rightId: string) => {
    if (!selectedLeft) return;
    if (rightId === selectedLeft) {
      playSound("correct");
      const nextL = { ...links, [selectedLeft]: rightId };
      update({ links: nextL });
      setSelectedLeft(null);
      if (Object.keys(nextL).length === MATCH_PAIRS.length && !done) {
        playSound("success");
        markDone();
      }
    } else {
      playSound("wrong");
      update({ mistakes: (typeof value.mistakes === "number" ? (value.mistakes as number) : 0) + 1 });
      setWrong(rightId);
      setTimeout(() => setWrong(null), 500);
    }
  };
  const colorOf = (id: string) => PAIR_COLORS[MATCH_PAIRS.findIndex((p) => p.id === id) % PAIR_COLORS.length];
  return (
    <div className="grid gap-5">
      <p className="text-center text-sm font-bold text-ink/60">اضغط على عنصر من العمود الأيمن ثم اضغط على ما يناسبه في العمود الأيسر</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <div className="grid gap-3">
          {MATCH_PAIRS.map((p) => {
            const linked = Boolean(links[p.id]);
            return (
              <button key={p.id} disabled={linked} onClick={() => { playSound("click"); setSelectedLeft(p.id); }} className={cx("rounded-2xl border-2 p-3 text-start font-heading text-base font-bold transition sm:text-lg", linked ? "text-white" : selectedLeft === p.id ? "border-saudi bg-saudi-light ring-4 ring-saudi/15" : "border-sand-dark bg-white hover:border-saudi")} style={linked ? { background: colorOf(p.id), borderColor: colorOf(p.id) } : undefined}>
                {p.left}
              </button>
            );
          })}
        </div>
        <div className="grid gap-3">
          {rights.map((p) => {
            const linked = Object.values(links).includes(p.id);
            return (
              <button key={p.id} disabled={linked || !selectedLeft} onClick={() => pick(p.id)} className={cx("rounded-2xl border-2 p-3 text-start text-sm font-medium leading-relaxed transition sm:text-base", linked ? "text-white" : wrong === p.id ? "shake border-rose-400 bg-rose-50" : selectedLeft ? "border-saudi/50 bg-white hover:border-saudi hover:bg-saudi-light" : "border-sand-dark bg-white/70")} style={linked ? { background: colorOf(p.id), borderColor: colorOf(p.id) } : undefined}>
                {p.right}
              </button>
            );
          })}
        </div>
      </div>
      {done && <DoneBanner>أحسنت! أكملت المطابقة بنجاح.</DoneBanner>}
    </div>
  );
}

/* -------------------------------- True/False ------------------------------- */
export function TrueFalseSlide({ value, update, done, markDone }: SlideProps) {
  const tfOrder = usePerm(TF_ITEMS.length); // statements appear in a new order each time
  const answers = rec(value.answers); // index -> "true" | "false"
  const answeredCount = Object.keys(answers).length;
  const score = TF_ITEMS.filter((t, i) => answers[String(i)] === String(t.answer)).length;
  const answer = (i: number, v: boolean) => {
    if (answers[String(i)]) return;
    const ok = v === TF_ITEMS[i].answer;
    playSound(ok ? "correct" : "wrong");
    const nextA = { ...answers, [String(i)]: String(v) };
    update({ answers: nextA });
    if (Object.keys(nextA).length === TF_ITEMS.length && !done) {
      playSound("success");
      markDone({ score: TF_ITEMS.filter((t, j) => nextA[String(j)] === String(t.answer)).length, total: TF_ITEMS.length });
    }
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-white/80 p-4 ring-1 ring-black/5">
        <span className="font-heading font-extrabold text-saudi">✅ حدد صواب أم خطأ لكل عبارة</span>
        <span className="chip bg-gold-light text-amber-900">النتيجة: {score} / {TF_ITEMS.length} — أجبت عن {answeredCount}</span>
      </div>
      <ul className="grid gap-3">
        {tfOrder.map((i, pos) => {
          const t = TF_ITEMS[i];
          const a = answers[String(i)];
          const answered = a !== undefined;
          const ok = answered && a === String(t.answer);
          return (
            <li key={i} className={cx("rounded-2xl border-2 p-3 transition", !answered ? "border-sand-dark bg-white" : ok ? "border-emerald-400 bg-emerald-50" : "border-rose-300 bg-rose-50")}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{pos + 1}</span>
                <p className="flex-1 text-base font-medium leading-relaxed sm:text-lg">{t.text}</p>
                <div className="flex gap-2">
                  <button disabled={answered} onClick={() => answer(i, true)} className={cx("rounded-xl px-4 py-2 font-heading font-bold transition", a === "true" ? (t.answer ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-40")}>
                    ✓ صواب
                  </button>
                  <button disabled={answered} onClick={() => answer(i, false)} className={cx("rounded-xl px-4 py-2 font-heading font-bold transition", a === "false" ? (!t.answer ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-40")}>
                    ✕ خطأ
                  </button>
                </div>
              </div>
              {answered && <p className={cx("mt-2 text-sm", ok ? "text-emerald-800" : "text-rose-800")}>{ok ? "✔ " : "✘ "}{t.why}</p>}
            </li>
          );
        })}
      </ul>
      {done && <DoneBanner>أكملت التقويم التكويني بنتيجة {score} من {TF_ITEMS.length}. {score === TF_ITEMS.length ? "علامة كاملة! 🌟" : "راجع العبارات الخاطئة قبل الاختبار الختامي."}</DoneBanner>}
    </div>
  );
}
