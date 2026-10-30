import { dbTarget } from "@/db";
import { DbConfigError, ensureSchema, resetSchemaMemo } from "@/db/ensure-schema";
import { json } from "@/lib/cors";

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

type AnyErr = {
  code?: string;
  message?: string;
  cause?: AnyErr;
  errors?: AnyErr[];
  name?: string;
};

/** Unwrap Drizzle's DrizzleQueryError ("Failed query: …") and Node AggregateErrors to the root cause. */
export function rootCause(e: unknown): AnyErr {
  let cur = (e ?? {}) as AnyErr;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.cause && typeof cur.cause === "object") cur = cur.cause;
    else if (Array.isArray(cur.errors) && cur.errors[0]) cur = cur.errors[0];
    else break;
  }
  return cur ?? {};
}

export function isSchemaMissingError(e: unknown): boolean {
  const c = rootCause(e);
  return c.code === "42P01" || c.code === "42703";
}

export function describeDbError(e: unknown): DbErrorInfo {
  const root = rootCause(e);
  const code = String(root.code ?? (e as AnyErr)?.code ?? "");
  const msg = String(root.message ?? (e as AnyErr)?.message ?? "خطأ غير معروف");
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
  if (code === "42501") {
    return { ...base, message: "حساب قاعدة البيانات لا يملك صلاحية إنشاء الجداول.", hint: "شغّل: npx drizzle-kit push --config drizzle.config.prod.ts بحساب يملك الصلاحية." };
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
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return { ...base, message: "تعذر العثور على خادم قاعدة البيانات (اسم المضيف غير صحيح).", hint: `المضيف: ${host}` };
  }
  if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ETIMEDOUT" || lower.includes("timeout") || lower.includes("connection terminated")) {
    return {
      ...base,
      message: "تعذر الاتصال بخادم قاعدة البيانات.",
      hint: dbTarget.isLocal ? "الرابط يشير إلى قاعدة محلية؛ تأكد من ضبط DATABASE_URL لقاعدة Neon على الخادم." : `تحقق من أن قاعدة ${host} تعمل (قد تكون في وضع السكون) ثم أعد المحاولة.`,
      retry: true,
    };
  }
  if (lower.includes("ssl") || lower.includes("certificate") || lower.includes("insecure") || code.includes("CERT")) {
    return { ...base, message: "مشكلة في اتصال SSL بقاعدة البيانات.", hint: "تأكد من أن رابط DATABASE_URL ينتهي بـ ?sslmode=require." };
  }
  if (code === "57P01" || code === "57P03" || lower.includes("starting up") || lower.includes("shutting down")) {
    return { ...base, message: "قاعدة البيانات غير متاحة مؤقتاً (قد تكون في وضع الاستيقاظ).", hint: "أعد المحاولة بعد ثوانٍ.", retry: true };
  }
  return { ...base, status: 500, message: "حدث خطأ أثناء التعامل مع قاعدة البيانات.", hint: "افتح لوحة المعلم → التشخيص لعرض التفاصيل." };
}

/** JSON error response for any DB related failure (friendly message + technical detail). */
export function dbError(e: unknown, req?: Request) {
  const info = describeDbError(e);
  if (process.env.NODE_ENV !== "production" || process.env.VERCEL) console.error("[db]", info.code, info.detail);
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
