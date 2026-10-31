import { dbTarget } from "@/db";
import { DbConfigError, ensureSchema, resetSchemaMemo } from "@/db/ensure-schema";
import { errorCode, errorMessage, isTransientDbError, rootCause } from "@/db/transient";
import { json } from "@/lib/cors";

export { rootCause } from "@/db/transient";

export type DbErrorInfo = {
  code: string;
  status: number;
  /** Friendly Arabic message shown to users */
  message: string;
  /** Technical detail for the teacher / developer (never the raw SQL) */
  detail: string;
  hint?: string;
  retry?: boolean;
};

export function isSchemaMissingError(e: unknown): boolean {
  const c = errorCode(e);
  return c === "42P01" || c === "42703" || c === "42P10";
}

export function describeDbError(e: unknown): DbErrorInfo {
  const code = errorCode(e);
  const msg = errorMessage(e) || "خطأ غير معروف";
  const lower = msg.toLowerCase();
  const host = dbTarget.host ?? "—";
  const base = { code: code || "DB_ERROR", status: 503, detail: code ? `${code}: ${msg}` : msg };

  if (e instanceof DbConfigError || code === "DB_NOT_CONFIGURED") {
    return {
      ...base,
      code: "DB_NOT_CONFIGURED",
      message: "لم يتم ضبط رابط قاعدة البيانات على الخادم.",
      hint: "أضف المتغير DATABASE_URL (رابط قاعدة Neon مع ?sslmode=require) في إعدادات مشروع Vercel ثم أعد النشر.",
    };
  }
  if (dbTarget.isLocal && dbTarget.serverless) {
    return {
      ...base,
      code: "DB_LOCAL_ON_SERVERLESS",
      message: "رابط قاعدة البيانات يشير إلى جهاز محلي (127.0.0.1) ولا يمكن الوصول إليه من خادم الاستضافة.",
      hint: "ضع رابط قاعدة Neon في المتغير DATABASE_URL داخل إعدادات Vercel (Settings → Environment Variables) ثم أعد النشر.",
    };
  }
  if (code === "42P01" || code === "42703") {
    resetSchemaMemo();
    void ensureSchema(true).catch(() => {});
    return {
      ...base,
      message: "جداول قاعدة البيانات غير مكتملة؛ جارٍ إنشاؤها تلقائياً.",
      hint: "أعد المحاولة بعد لحظات، أو افتح /api/setup لإنشاء الجداول يدوياً.",
      retry: true,
    };
  }
  if (code === "42P10") {
    resetSchemaMemo();
    void ensureSchema(true).catch(() => {});
    return {
      ...base,
      message: "جدول التقدم يفتقد قيد التفرد على معرف الطالب؛ جارٍ إصلاحه تلقائياً.",
      hint: "أعد المحاولة بعد لحظات، أو افتح /api/setup ثم تحقق من «التشخيص».",
      retry: true,
    };
  }
  if (code === "23505") {
    return { ...base, status: 409, message: "هذا السجل موجود مسبقاً (اسم مكرر).", hint: "لا يمكن تكرار الاسم نفسه في الفصل." };
  }
  if (code === "42501") {
    return { ...base, message: "حساب قاعدة البيانات لا يملك الصلاحية اللازمة على الجداول.", hint: "تأكد أن الدور المستخدم في DATABASE_URL هو مالك قاعدة البيانات (مثل neondb_owner)." };
  }
  if (code === "28P01" || code === "28000") {
    return { ...base, message: "اسم المستخدم أو كلمة المرور لقاعدة البيانات غير صحيحة.", hint: `راجع رابط الاتصال بالمضيف ${host}.` };
  }
  if (code === "3D000") {
    return { ...base, message: "قاعدة البيانات المحددة في الرابط غير موجودة.", hint: `اسم قاعدة البيانات في الرابط: ${dbTarget.database ?? "—"}.` };
  }
  if (code === "53300" || lower.includes("too many connections") || lower.includes("remaining connection slots")) {
    return { ...base, message: "تجاوز عدد الاتصالات بقاعدة البيانات الحد المسموح.", hint: "استخدم رابط الـ pooler من Neon (يحتوي على -pooler في اسم المضيف).", retry: true };
  }
  if (code === "ENOTFOUND") {
    return { ...base, message: "تعذر العثور على خادم قاعدة البيانات (اسم المضيف غير صحيح).", hint: `المضيف: ${host}` };
  }
  if (code === "57014" || lower.includes("statement timeout") || lower.includes("canceling statement")) {
    return { ...base, message: "استغرق الاستعلام وقتاً أطول من المسموح.", hint: "أعد المحاولة؛ وإن تكرر تحقق من حجم قاعدة البيانات.", retry: true };
  }
  if (lower.includes("ssl") || lower.includes("certificate") || lower.includes("insecure") || code.includes("CERT")) {
    return { ...base, message: "مشكلة في اتصال SSL بقاعدة البيانات.", hint: "تأكد من أن رابط DATABASE_URL ينتهي بـ ?sslmode=require." };
  }
  if (isTransientDbError(e)) {
    return {
      ...base,
      message: "انقطع الاتصال بقاعدة البيانات مؤقتاً (قد تكون في وضع الاستيقاظ).",
      hint: dbTarget.isLocal ? "الرابط يشير إلى قاعدة محلية؛ تأكد من ضبط DATABASE_URL لقاعدة Neon على الخادم." : `أعد المحاولة بعد ثوانٍ. (المضيف: ${host}${dbTarget.pooler ? "" : " — يُنصح باستخدام رابط -pooler من Neon"})`,
      retry: true,
    };
  }
  return {
    ...base,
    status: 500,
    message: `حدث خطأ أثناء التعامل مع قاعدة البيانات${code ? ` (الرمز ${code})` : ""}.`,
    hint: "افتح لوحة المعلم → التشخيص؛ يعرض «اختبار الكتابة» سبب المشكلة بدقة.",
  };
}

/** JSON error response for any DB related failure (friendly message + technical detail). */
export function dbError(e: unknown, req?: Request) {
  const info = describeDbError(e);
  const root = rootCause(e);
  console.error("[db]", info.code, info.detail, root.stack ? `\n${String(root.stack).split("\n").slice(0, 4).join("\n")}` : "");
  return json(
    { ok: false, error: info.message, code: info.code, detail: info.detail, hint: info.hint, retry: info.retry ?? false },
    { req, status: info.status },
  );
}

/** Call at the start of every DB-backed route: provisions the schema once per instance. */
export async function prepareDb(req: Request): Promise<Response | null> {
  try {
    await ensureSchema();
    return null;
  } catch (e) {
    return dbError(e, req);
  }
}
