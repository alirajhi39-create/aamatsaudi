"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- Confetti ------------------------------- */
const COLORS = ["#0f6e56", "#d4a443", "#a0353f", "#2f4b6e", "#f59e0b", "#10b981"];
export function Confetti({ show, count = 90 }: { show: boolean; count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.8,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
      })),
    [count],
  );
  if (!show) return null;
  return (
    <div aria-hidden className="pointer-events-none">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------------------------- Option button ---------------------------- */
export type OptionState = "idle" | "selected" | "correct" | "wrong" | "disabled";
export function OptionButton({
  children,
  state = "idle",
  onClick,
  index,
}: {
  children: ReactNode;
  state?: OptionState;
  onClick?: () => void;
  index?: number;
}) {
  const letters = ["أ", "ب", "ج", "د", "هـ", "و"];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "disabled" || state === "correct" || state === "wrong"}
      className={cx(
        "group flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start text-lg font-medium leading-relaxed transition-all sm:text-xl",
        state === "idle" && "border-sand-dark bg-white hover:border-saudi hover:bg-saudi-light",
        state === "selected" && "border-saudi bg-saudi-light ring-4 ring-saudi/15",
        state === "correct" && "border-emerald-500 bg-emerald-50 text-emerald-900",
        state === "wrong" && "border-rose-400 bg-rose-50 text-rose-900 shake",
        state === "disabled" && "border-sand-dark bg-white/60 opacity-60",
      )}
    >
      {index !== undefined && (
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-base font-bold",
            state === "correct" ? "bg-emerald-500 text-white" : state === "wrong" ? "bg-rose-500 text-white" : "bg-sand text-saudi group-hover:bg-saudi group-hover:text-white",
          )}
        >
          {state === "correct" ? "✓" : state === "wrong" ? "✕" : letters[index]}
        </span>
      )}
      <span className="flex-1">{children}</span>
    </button>
  );
}

/* ------------------------------ Choice list ------------------------------ */
export type ChoiceItem = { text: string; correct?: boolean };
/**
 * Ready-made choices (single or multiple). `reveal` colours the answers:
 *  - "selected": only selected items are marked right/wrong (instant feedback)
 *  - "all": also highlights correct options the student missed
 */
export function ChoiceList({
  options,
  selected,
  onToggle,
  reveal,
  disabled = false,
  max,
  single = false,
  columns = 1,
}: {
  options: ChoiceItem[];
  selected: string[];
  onToggle: (text: string) => void;
  reveal?: "selected" | "all";
  disabled?: boolean;
  max?: number;
  single?: boolean;
  columns?: 1 | 2;
}) {
  return (
    <div className={cx("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
      {options.map((o) => {
        const sel = selected.includes(o.text);
        const graded = reveal && typeof o.correct === "boolean";
        let state: "none" | "sel" | "ok" | "bad" | "missed" = sel ? "sel" : "none";
        if (graded) {
          if (sel && o.correct) state = "ok";
          else if (sel && !o.correct) state = "bad";
          else if (!sel && o.correct && reveal === "all") state = "missed";
        }
        const full = max !== undefined && !sel && selected.length >= max;
        return (
          <button
            type="button"
            key={o.text}
            disabled={disabled || full}
            onClick={() => onToggle(o.text)}
            className={cx(
              "flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-start text-lg font-medium leading-relaxed transition disabled:cursor-not-allowed",
              state === "none" && "border-sand-dark bg-white hover:border-saudi disabled:opacity-50",
              state === "sel" && "border-saudi bg-saudi-light",
              state === "ok" && "border-emerald-500 bg-emerald-50 text-emerald-900",
              state === "bad" && "border-rose-400 bg-rose-50 text-rose-900",
              state === "missed" && "border-amber-400 bg-amber-50 text-amber-900",
            )}
          >
            <span
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center border-2 text-sm font-bold",
                single ? "rounded-full" : "rounded-lg",
                state === "ok" ? "border-emerald-500 bg-emerald-500 text-white" : state === "bad" ? "border-rose-500 bg-rose-500 text-white" : sel ? "border-saudi bg-saudi text-white" : "border-sand-dark bg-white",
              )}
            >
              {state === "bad" ? "✕" : sel ? "✓" : ""}
            </span>
            <span className="flex-1">{o.text}</span>
            {state === "bad" && <span className="shrink-0 text-xs">غير صحيح</span>}
            {state === "missed" && <span className="shrink-0 text-xs">إجابة فاتتك</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------- Feedback ------------------------------- */
export function Feedback({ kind, children }: { kind: "correct" | "wrong" | "info" | "success"; children: ReactNode }) {
  const styles = {
    correct: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    wrong: "bg-rose-50 text-rose-900 ring-rose-200",
    info: "bg-navy-light text-navy ring-navy/20",
  }[kind];
  const icon = { correct: "🎉", success: "🌟", wrong: "🤔", info: "💡" }[kind];
  return (
    <div className={cx("pop flex items-start gap-3 rounded-2xl px-4 py-3 ring-2", styles)}>
      <span className="text-2xl leading-none">{icon}</span>
      <div className="flex-1 text-lg leading-relaxed">{children}</div>
    </div>
  );
}

/* ------------------------------- Info box ------------------------------- */
export function InfoBox({ title = "للاطلاع", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="relative rounded-2xl border-2 border-dashed border-maroon/40 bg-maroon-light/60 p-4 pt-6">
      <span className="absolute -top-3 right-4 rounded-lg bg-maroon px-3 py-0.5 font-heading text-sm font-bold text-white">
        🔎 {title}
      </span>
      <div className="text-lg leading-[1.9] text-maroon-dark">{children}</div>
    </div>
  );
}

/* ------------------------------ Strategy badge ----------------------------- */
export function StrategyBadge({ strategy }: { strategy: string }) {
  return (
    <span className="chip bg-gold-light text-amber-900 ring-1 ring-gold/50">
      <span>🎯</span>
      <span>استراتيجية: {strategy}</span>
    </span>
  );
}

/* --------------------------------- Stars --------------------------------- */
export function Stars({ value, onChange, max = 3, label }: { value: number; onChange?: (v: number) => void; max?: number; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm font-bold text-ink/70">{label}</span>}
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange?.(i + 1)}
            className={cx("text-2xl transition-transform hover:scale-125", i < value ? "grayscale-0" : "grayscale opacity-40")}
            aria-label={`${i + 1} نجوم`}
          >
            ⭐
          </button>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------- Modal --------------------------------- */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="card pop max-h-[92vh] w-full max-w-2xl overflow-auto rounded-b-none p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-heading text-xl font-extrabold text-saudi">{title}</h3>
          <button className="btn-ghost px-3 py-1 text-xl" onClick={onClose} aria-label="إغلاق">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ Progress ring ------------------------------ */
export function ProgressRing({ percent, size = 64, stroke = 7, color = "#0f6e56" }: { percent: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e8e0d0" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-700" />
    </svg>
  );
}

/* ---------------------------- Text area w/ counter ---------------------------- */
export function AnswerArea({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <textarea
        className="input resize-y leading-relaxed"
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="mt-1 text-end text-xs text-ink/50">{value.trim().length} حرف</div>
    </div>
  );
}

/* ------------------------------ Done banner ------------------------------ */
export function DoneBanner({ children = "أحسنت! أكملت هذا النشاط، يمكنك الانتقال إلى الشريحة التالية." }: { children?: ReactNode }) {
  return <Feedback kind="success">{children}</Feedback>;
}

/* ------------------------------ Simple toast ------------------------------ */
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => setMsg({ text, kind }), []);
  const Toast = msg ? (
    <div className={cx("fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-2xl px-5 py-3 font-bold text-white shadow-xl pop", msg.kind === "ok" ? "bg-saudi" : "bg-rose-600")}>
      {msg.text}
    </div>
  ) : null;
  return { toast, Toast };
}
