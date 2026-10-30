"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SLIDES } from "@/lib/lesson-content";
import { EFFECT_SOUND_KEYS, MAX_SOUND_BYTES, formatBytes, narrationKey, type SoundKeyInfo } from "@/lib/sound-keys";
import { getTeacherPin, teacherFetch } from "@/lib/client-api";
import { cx } from "@/components/ui";

type SoundMeta = { key: string; fileName: string; mimeType: string; sizeBytes: number; etag: string; url: string; updatedAt: string };

const NARRATION_KEYS: SoundKeyInfo[] = SLIDES.map((s, i) => ({
  key: narrationKey(i),
  label: `شرح الشريحة ${i + 1}: ${s.title}`,
  description: s.strategy,
  group: "narration",
}));

export default function SoundsManager({ toast }: { toast: (m: string, k?: "ok" | "err") => void }) {
  const [sounds, setSounds] = useState<Record<string, SoundMeta>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"effects" | "narration">("effects");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sounds", { cache: "no-store" });
      const data = (await res.json()) as { sounds: SoundMeta[] };
      const map: Record<string, SoundMeta> = {};
      for (const s of data.sounds ?? []) map[s.key] = s;
      setSounds(map);
    } catch {
      toast("تعذر تحميل قائمة الأصوات", "err");
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (key: string, file: File | Blob, fileName: string) => {
    if (file.size > MAX_SOUND_BYTES) return toast(`الحجم ${formatBytes(file.size)} يتجاوز الحد الأقصى 4 ميجابايت`, "err");
    setBusyKey(key);
    try {
      const form = new FormData();
      form.append("key", key);
      form.append("file", file, fileName);
      const res = await fetch("/api/sounds", { method: "POST", body: form, headers: { "X-Teacher-Pin": getTeacherPin() } });
      const data = (await res.json()) as { ok: boolean; error?: string; sound?: SoundMeta };
      if (!res.ok || !data.ok) throw new Error(data.error || "فشل الرفع");
      toast("تم حفظ الصوت في قاعدة البيانات ✓");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الرفع", "err");
    } finally {
      setBusyKey(null);
    }
  };

  const remove = async (key: string) => {
    if (!confirm("حذف هذا الصوت والعودة إلى الصوت الافتراضي؟")) return;
    setBusyKey(key);
    try {
      await teacherFetch(`/api/sounds?key=${encodeURIComponent(key)}`, { method: "DELETE" });
      toast("تم الحذف");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "فشل الحذف", "err");
    } finally {
      setBusyKey(null);
    }
  };

  const play = (key: string) => {
    const s = sounds[key];
    if (!s) return;
    audioRef.current?.pause();
    const a = new Audio(`${s.url}&t=${Date.now()}`);
    audioRef.current = a;
    void a.play();
  };

  const startRecording = async (key: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4") ? "m4a" : "webm";
        await upload(key, blob, `${key}.${ext}`);
      };
      rec.start();
      recorder.current = rec;
      setRecordingKey(key);
    } catch {
      toast("تعذر الوصول إلى الميكروفون", "err");
    }
  };
  const stopRecording = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecordingKey(null);
  };

  const list = tab === "effects" ? EFFECT_SOUND_KEYS : NARRATION_KEYS;
  const customCount = Object.keys(sounds).length;
  const totalBytes = Object.values(sounds).reduce((a, s) => a + s.sizeBytes, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-black text-saudi">🔊 إدارة الأصوات المخصصة</h3>
          <p className="text-sm text-ink/60">
            تُخزَّن الملفات داخل قاعدة البيانات (BYTEA). الحد الأقصى لكل ملف 4 ميجابايت. الأصوات المخصصة: {customCount} — الحجم الإجمالي: {formatBytes(totalBytes)}
          </p>
        </div>
        <div className="flex rounded-2xl bg-sand p-1">
          {(["effects", "narration"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("rounded-xl px-4 py-2 font-heading font-bold transition", tab === t ? "bg-saudi text-white" : "text-ink/60")}>
              {t === "effects" ? "المؤثرات الصوتية" : "التعليق الصوتي للشرائح"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        {list.map((k) => {
          const s = sounds[k.key];
          const busy = busyKey === k.key;
          const rec = recordingKey === k.key;
          return (
            <div key={k.key} className={cx("card flex flex-wrap items-center gap-3 p-3", s && "ring-2 ring-saudi/30")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading font-extrabold">{k.label}</span>
                  <code className="rounded-md bg-sand px-1.5 py-0.5 text-xs text-ink/60">{k.key}</code>
                  {s ? <span className="chip bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">مخصص ✓</span> : <span className="chip bg-sand text-ink/50">افتراضي</span>}
                </div>
                <p className="text-xs text-ink/50">
                  {k.description}
                  {s && ` — ${s.fileName} (${formatBytes(s.sizeBytes)}) — ${s.mimeType}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s && (
                  <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => play(k.key)} disabled={busy}>
                    ▶ تشغيل
                  </button>
                )}
                <label className={cx("btn-primary cursor-pointer px-3 py-1.5 text-sm", busy && "opacity-50")}>
                  {busy ? "⏳" : "⬆️ رفع ملف"}
                  <input
                    type="file"
                    accept="audio/*,.webm,.m4a,.mp3,.ogg,.wav"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(k.key, f, f.name);
                      e.target.value = "";
                    }}
                  />
                </label>
                {rec ? (
                  <button className="btn-maroon animate-pulse px-3 py-1.5 text-sm" onClick={stopRecording}>
                    ⏹ إيقاف التسجيل
                  </button>
                ) : (
                  <button className="btn-secondary px-3 py-1.5 text-sm" onClick={() => startRecording(k.key)} disabled={busy || recordingKey !== null}>
                    🎙️ تسجيل
                  </button>
                )}
                {s && (
                  <button className="btn-ghost px-3 py-1.5 text-sm text-rose-700" onClick={() => remove(k.key)} disabled={busy}>
                    🗑️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-ink/50">
        💡 يُقدَّم كل صوت عبر <code>/api/sounds?key=المفتاح</code> مع ترويسات ETag و Cache-Control، ويدعم طلبات If-None-Match (304).
      </p>
    </div>
  );
}
