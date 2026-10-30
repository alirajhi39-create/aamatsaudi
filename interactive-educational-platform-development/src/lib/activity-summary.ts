import type { ProgressRecord } from "@/lib/client-api";
import { ACTIVITY1, ACTIVITY2, EXIT_CONFIDENCE, EXIT_SECTIONS, RESPECT_BEHAVIORS, VALUES_OPTIONS } from "@/lib/lesson-content";

export type SummaryTone = "ok" | "bad" | "neutral";
export type SummaryItem = { title: string; lines: string[]; tone: SummaryTone };

const mark = (ok: boolean) => (ok ? "✔" : "✘");
const list = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
function act<T>(s: ProgressRecord, id: string): T {
  return (s.activities?.[id] as T) ?? ({} as T);
}
function sameSet(sel: string[], correct: string[]) {
  return sel.length === correct.length && correct.every((c) => sel.includes(c));
}

/** Human-readable summary of every choice-based activity a student answered (for dashboard + PDF). */
export function summarizeActivities(s: ProgressRecord): SummaryItem[] {
  const out: SummaryItem[] = [];

  // K-W-L
  const kwl = act<{ know?: string[]; want?: string[] }>(s, "kwl");
  if (list(kwl.know).length) out.push({ title: "K — ماذا أعرف؟", lines: list(kwl.know).map((t) => `• ${t}`), tone: "neutral" });
  if (list(kwl.want).length) out.push({ title: "W — ماذا أريد أن أعرف؟", lines: list(kwl.want).map((t) => `• ${t}`), tone: "neutral" });

  // Activity 1 (think – pair – share)
  const a1 = act<{ a?: number; b?: string[]; pair?: string; attempts?: number }>(s, "activity1");
  if (typeof a1.a === "number") {
    const opt = ACTIVITY1.partA.options[a1.a];
    out.push({
      title: `نشاط ١ (أ): ${ACTIVITY1.partA.question}`,
      lines: [`${mark(Boolean(opt?.correct))} ${opt?.text ?? "—"}`],
      tone: opt?.correct ? "ok" : "bad",
    });
  }
  if (list(a1.b).length) {
    const sel = list(a1.b);
    const correct = ACTIVITY1.partB.options.filter((o) => o.correct).map((o) => o.text);
    out.push({ title: `نشاط ١ (ب): ${ACTIVITY1.partB.question}`, lines: sel.map((t) => `${mark(correct.includes(t))} ${t}`), tone: sameSet(sel, correct) ? "ok" : "bad" });
  }
  if (a1.pair) {
    const p = ACTIVITY1.pairOptions.find((o) => o.id === a1.pair);
    if (p) out.push({ title: "نشاط ١ — نتيجة المناقشة مع الزميل", lines: [`${p.emoji} ${p.text}`], tone: "neutral" });
  }

  // Activity 2 (critical thinking)
  const a2 = act<{ effects?: string[]; sentence?: Record<string, string> }>(s, "activity2");
  if (list(a2.effects).length) {
    const sel = list(a2.effects);
    const correct = ACTIVITY2.effects.filter((e) => e.correct).map((e) => e.text);
    out.push({ title: `نشاط ٢: ${ACTIVITY2.question}`, lines: sel.map((t) => `${mark(correct.includes(t))} ${t}`), tone: sameSet(sel, correct) ? "ok" : "bad" });
  }
  if (a2.sentence && Object.keys(a2.sentence).length) {
    const sentence = a2.sentence;
    const lines = ACTIVITY2.sentence.map((b) => {
      const v = sentence[b.id];
      return `${mark(v === b.answer)} ${b.before} «${v ?? "—"}»${v && v !== b.answer ? ` (الصحيح: ${b.answer})` : ""}`;
    });
    out.push({ title: "نشاط ٢ — إكمال الجملة", lines, tone: ACTIVITY2.sentence.every((b) => sentence[b.id] === b.answer) ? "ok" : "bad" });
  }

  // Values
  const values = act<{ selected?: string[]; checked?: boolean; behaviors?: string[] }>(s, "values");
  if (list(values.selected).length) {
    const sel = list(values.selected);
    const correct = VALUES_OPTIONS.filter((o) => o.correct).map((o) => o.text);
    out.push({ title: "القيم التي ظهرت في موقف الملك عبدالعزيز مع والده", lines: sel.map((t) => `${mark(correct.includes(t))} ${t}`), tone: sameSet(sel, correct) ? "ok" : "bad" });
  }
  if (list(values.behaviors).length) {
    const sel = list(values.behaviors);
    const correct = RESPECT_BEHAVIORS.filter((o) => o.correct).map((o) => o.text);
    out.push({ title: "سلوكيات احترام الوالدين التي اختارها الطالب", lines: sel.map((t) => `${mark(correct.includes(t))} ${t}`), tone: sel.every((t) => correct.includes(t)) ? "ok" : "bad" });
  }

  // Exit ticket 3-2-1
  const exit = act<{ learned?: string[]; liked?: string[]; question?: string; confidence?: number }>(s, "exit");
  for (const sec of EXIT_SECTIONS) {
    const v = sec.id === "question" ? (exit.question ? [exit.question] : []) : list(exit[sec.id]);
    if (v.length) out.push({ title: `${sec.icon} ${sec.label}`, lines: v.map((t) => `• ${t}`), tone: "neutral" });
  }
  if (exit.confidence) {
    const c = EXIT_CONFIDENCE.find((x) => x.value === exit.confidence);
    if (c) out.push({ title: "تقييم الطالب لفهمه", lines: [`${c.emoji} ${c.label}`], tone: "neutral" });
  }

  return out;
}
