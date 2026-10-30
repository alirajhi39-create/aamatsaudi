/** Max upload size (Vercel serverless functions accept ~4.5MB request bodies). */
export const MAX_SOUND_BYTES = 4 * 1024 * 1024;
export const SOUND_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export const ALLOWED_AUDIO_MIME_PREFIXES = ["audio/", "video/webm", "video/ogg", "application/ogg", "application/octet-stream"];

export type SoundKeyInfo = { key: string; label: string; description: string; group: "effects" | "narration" };

export const EFFECT_SOUND_KEYS: SoundKeyInfo[] = [
  { key: "click", label: "نقرة الأزرار", description: "يُشغَّل عند الضغط على الأزرار والتنقل بين الشرائح", group: "effects" },
  { key: "correct", label: "إجابة صحيحة", description: "عند اختيار إجابة صحيحة في الأنشطة والاختبار", group: "effects" },
  { key: "wrong", label: "إجابة خاطئة", description: "عند اختيار إجابة خاطئة", group: "effects" },
  { key: "flip", label: "قلب البطاقة", description: "عند قلب بطاقات الاستكشاف", group: "effects" },
  { key: "success", label: "إنجاز نشاط", description: "عند إكمال نشاط بنجاح", group: "effects" },
  { key: "celebrate", label: "احتفال ختامي", description: "عند إكمال الدرس والحصول على الشهادة", group: "effects" },
  { key: "welcome", label: "ترحيب", description: "يُشغَّل عند دخول الطالب إلى الدرس", group: "effects" },
];

export function narrationKey(slideIndex: number): string {
  return `narration-${slideIndex + 1}`;
}

export function isAllowedAudioMime(mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return ALLOWED_AUDIO_MIME_PREFIXES.some((p) => m.startsWith(p));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
