"use client";

export type StudentSession = { studentId: string; name: string; className: string; locked: boolean };

export type ProgressRecord = {
  id: number;
  studentId: string;
  name: string;
  className: string;
  classRaw: string | null;
  currentSlide: number;
  maxSlide: number;
  quizScore: number | null;
  quizTotal: number | null;
  quizAttempts: number;
  activities: Record<string, unknown>;
  completed: boolean;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  locked?: boolean;
};

export type RosterItem = { studentId: string; name: string; locked: boolean; claimed: boolean };

export type TakenInfo = {
  name: string;
  currentSlide: number;
  maxSlide: number;
  completed: boolean;
  lastSeenAt: string;
  locked: boolean;
};

export type LoginResult =
  | { ok: true; resumed: boolean; student: StudentSession; progress: ProgressRecord }
  | { ok: false; code: "NAME_TAKEN"; error: string; existing?: TakenInfo };

const SESSION_KEY = "ssa2.student";
const PIN_KEY = "ssa2.teacherPin";

export function getSession(): StudentSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StudentSession) : null;
  } catch {
    return null;
  }
}
export function setSession(s: StudentSession | null) {
  if (typeof window === "undefined") return;
  if (!s) window.localStorage.removeItem(SESSION_KEY);
  else window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export async function loginStudent(input: {
  name?: string;
  className?: string;
  studentId?: string;
  confirmResume?: boolean;
}): Promise<LoginResult> {
  const res = await fetch("/api/progress/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as (LoginResult & { error?: string }) | { ok: false; error?: string; existing?: TakenInfo };
  if (res.status === 409) {
    return { ok: false, code: "NAME_TAKEN", error: data.error ?? "هذا الاسم مسجل مسبقاً", existing: (data as { existing?: TakenInfo }).existing };
  }
  if (!res.ok || !data.ok) throw new Error(data.error || "تعذر تسجيل الدخول");
  return data as Extract<LoginResult, { ok: true }>;
}

export async function fetchRoster(className: string): Promise<RosterItem[]> {
  try {
    const res = await fetch(`/api/teacher/names?class=${encodeURIComponent(className)}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { names?: RosterItem[] };
    return data.names ?? [];
  } catch {
    return [];
  }
}

export type SavePayload = {
  studentId: string;
  name: string;
  className: string;
  currentSlide: number;
  maxSlide: number;
  activities?: Record<string, unknown>;
  quizScore?: number;
  quizTotal?: number;
  quizSubmitted?: boolean;
  completed?: boolean;
};

export async function saveProgressRemote(payload: SavePayload, keepalive = false) {
  const res = await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive,
  });
  const data = (await res.json()) as { ok: boolean; error?: string; locked?: boolean; progress?: ProgressRecord };
  if (!res.ok || !data.ok) throw new Error(data.error || "فشل الحفظ");
  return data;
}

/* ------------------------------ Teacher ------------------------------ */

export function getTeacherPin(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PIN_KEY) ?? "";
}
export function setTeacherPin(pin: string | null) {
  if (typeof window === "undefined") return;
  if (!pin) window.sessionStorage.removeItem(PIN_KEY);
  else window.sessionStorage.setItem(PIN_KEY, pin);
}

export async function teacherFetch<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Teacher-Pin", getTeacherPin());
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
