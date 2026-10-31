"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound";
import { cx } from "@/components/ui";

export type TimerState = {
  /** Accumulated seconds from previous runs (persisted) */
  elapsed: number;
  /** Epoch ms when the current run started, null when paused */
  startedAt: number | null;
  /** Optional countdown target in seconds (0 = stopwatch mode) */
  target: number;
  /** Set once the countdown reached zero */
  finishedAt?: string;
};

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const PRESETS = [1, 2, 3, 5];

/**
 * Per-slide timer. Starts only when the student presses it (stopwatch), or counts down from a
 * chosen number of minutes. The state is stored inside the slide's activity data so the teacher
 * sees the time spent and the timer survives reloads / device switches.
 */
export default function SlideTimer({ value, onChange, slideId }: { value: TimerState | undefined; onChange: (next: TimerState) => void; slideId: string }) {
  const state: TimerState = value ?? { elapsed: 0, startedAt: null, target: 0 };
  const running = state.startedAt !== null;
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const alarmFired = useRef(false);

  // Tick while running (and keep in sync if the tab was hidden)
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running, state.startedAt]);

  const seconds = state.elapsed + (running && state.startedAt ? (now - state.startedAt) / 1000 : 0);
  const remaining = state.target > 0 ? state.target - seconds : null;
  const finished = remaining !== null && remaining <= 0;
  const warning = remaining !== null && remaining > 0 && remaining <= 30;

  // Countdown reached zero → stop, alarm, persist
  useEffect(() => {
    if (!finished || !running || alarmFired.current) return;
    alarmFired.current = true;
    playSound("celebrate");
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
    onChange({ ...state, elapsed: state.target, startedAt: null, finishedAt: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, running]);

  useEffect(() => {
    alarmFired.current = false;
  }, [slideId]);

  const start = useCallback(() => {
    playSound("click");
    onChange({ ...state, startedAt: Date.now() });
  }, [onChange, state]);
  const pause = useCallback(() => {
    playSound("click");
    onChange({ ...state, elapsed: seconds, startedAt: null });
  }, [onChange, state, seconds]);
  const reset = useCallback(() => {
    playSound("flip");
    alarmFired.current = false;
    onChange({ elapsed: 0, startedAt: null, target: state.target });
  }, [onChange, state.target]);
  const setTarget = useCallback(
    (minutes: number) => {
      playSound("click");
      alarmFired.current = false;
      onChange({ elapsed: 0, startedAt: Date.now(), target: minutes * 60 });
      setOpen(false);
    },
    [onChange],
  );

  const display = remaining !== null ? formatClock(Math.max(0, remaining)) : formatClock(seconds);
  const progress = state.target > 0 ? Math.min(100, (seconds / state.target) * 100) : 0;

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={running ? pause : start}
        aria-pressed={running}
        title={running ? "إيقاف المؤقت مؤقتاً" : seconds > 0 ? "متابعة المؤقت" : "ابدأ مؤقت الشريحة"}
        className={cx(
          "relative flex min-h-11 items-center gap-2 overflow-hidden rounded-2xl px-3 py-2 font-heading text-lg font-extrabold tabular-nums ring-2 transition",
          finished ? "bg-maroon text-white ring-maroon" : warning ? "animate-pulse bg-amber-100 text-amber-900 ring-amber-400" : running ? "bg-navy text-white ring-navy" : "bg-white text-navy ring-navy/30 hover:bg-navy-light",
        )}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {state.target > 0 && !finished && <span className="absolute inset-y-0 right-0 bg-white/20" style={{ width: `${progress}%` }} aria-hidden />}
        <span className="relative text-xl">{finished ? "⏰" : running ? "⏸" : "⏱️"}</span>
        <span dir="ltr" className="relative min-w-[5ch]">
          {display}
        </span>
        <span className="relative hidden text-sm font-bold sm:inline">{finished ? "انتهى الوقت" : running ? "إيقاف" : seconds > 0 ? "متابعة" : "ابدأ المؤقت"}</span>
      </button>
      <button type="button" onClick={() => setOpen((o) => !o)} className="btn-ghost min-h-11 px-2.5 text-base ring-1 ring-black/10" title="مؤقت تنازلي" aria-label="خيارات المؤقت">
        ⏳
      </button>
      {seconds > 0 && !running && (
        <button type="button" onClick={reset} className="btn-ghost min-h-11 px-2.5 text-base ring-1 ring-black/10" title="تصفير المؤقت" aria-label="تصفير المؤقت">
          ↺
        </button>
      )}
      {open && (
        <div className="card pop absolute left-0 top-full z-40 mt-2 w-60 p-3 sm:left-auto sm:right-0">
          <p className="mb-2 font-heading text-sm font-extrabold text-navy">⏳ مؤقت تنازلي لهذه الشريحة</p>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((m) => (
              <button key={m} type="button" onClick={() => setTarget(m)} className={cx("rounded-xl py-2 font-heading font-bold ring-1 transition", state.target === m * 60 ? "bg-navy text-white ring-navy" : "bg-sand ring-sand-dark hover:bg-navy-light")}>
                {m} د
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              playSound("click");
              alarmFired.current = false;
              onChange({ elapsed: 0, startedAt: null, target: 0 });
              setOpen(false);
            }}
            className="btn-secondary mt-2 w-full py-2 text-sm"
          >
            ⏱️ ساعة إيقاف عادية
          </button>
        </div>
      )}
    </div>
  );
}
