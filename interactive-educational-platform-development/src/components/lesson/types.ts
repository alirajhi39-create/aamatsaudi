import type { StudentSession } from "@/lib/client-api";

export type SlideValue = Record<string, unknown>;

export type SlideProps = {
  /** This slide's saved activity data (part of lesson_progress.activities JSON) */
  value: SlideValue;
  /** Shallow-merge a patch into this slide's data (auto-saved) */
  update: (patch: SlideValue) => void;
  done: boolean;
  /** Mark the slide completed (unlocks navigation) */
  markDone: (extra?: SlideValue) => void;
  session: StudentSession;
  quiz: { score: number | null; total: number | null; attempts: number };
  onQuizSubmit?: (score: number, total: number) => void;
  onLessonComplete?: () => void;
  next?: () => void;
};

export function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
export function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function arr<T = string>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
export function rec(v: unknown): Record<string, string> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

/** Deterministic shuffle so the order is stable between renders/reloads for the same student */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
