import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessonSounds } from "@/db/schema";
import { corsHeaders, error, json, preflight } from "@/lib/cors";
import { isTeacherAuthorized } from "@/lib/teacher-auth";
import { dbError, prepareDb } from "@/lib/db-errors";
import { MAX_SOUND_BYTES, SOUND_KEY_PATTERN, isAllowedAudioMime } from "@/lib/sound-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

function normalizeKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function metaOf(row: {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  etag: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    key: row.key,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    etag: row.etag,
    url: `/api/sounds?key=${encodeURIComponent(row.key)}&v=${row.etag.slice(1, 9)}`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/* ------------------------------ GET (list / fetch) ------------------------------ */

export async function GET(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  const params = new URL(req.url).searchParams;
  const key = normalizeKey(params.get("key"));

  try {
    if (!key) {
      const rows = await db
        .select({
          key: lessonSounds.key,
          fileName: lessonSounds.fileName,
          mimeType: lessonSounds.mimeType,
          sizeBytes: lessonSounds.sizeBytes,
          etag: lessonSounds.etag,
          createdAt: lessonSounds.createdAt,
          updatedAt: lessonSounds.updatedAt,
        })
        .from(lessonSounds)
        .orderBy(asc(lessonSounds.key));
      const res = json(
        { ok: true, count: rows.length, maxBytes: MAX_SOUND_BYTES, sounds: rows.map(metaOf) },
        { req },
      );
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    if (!SOUND_KEY_PATTERN.test(key)) return error("مفتاح الصوت غير صالح", 400, req);

    if (params.get("meta") === "true") {
      const rows = await db
        .select({
          key: lessonSounds.key,
          fileName: lessonSounds.fileName,
          mimeType: lessonSounds.mimeType,
          sizeBytes: lessonSounds.sizeBytes,
          etag: lessonSounds.etag,
          createdAt: lessonSounds.createdAt,
          updatedAt: lessonSounds.updatedAt,
        })
        .from(lessonSounds)
        .where(eq(lessonSounds.key, key))
        .limit(1);
      if (!rows[0]) return json({ ok: true, found: false }, { req, status: 404 });
      return json({ ok: true, found: true, sound: metaOf(rows[0]) }, { req });
    }

    const rows = await db.select().from(lessonSounds).where(eq(lessonSounds.key, key)).limit(1);
    const row = rows[0];
    const cors = corsHeaders(req.headers.get("origin"));
    if (!row) {
      return new NextResponse(JSON.stringify({ ok: false, error: "NOT_FOUND", key }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    const lastModified = row.updatedAt.toUTCString();
    const baseHeaders: Record<string, string> = {
      ...cors,
      ETag: row.etag,
      "Last-Modified": lastModified,
      "Cache-Control": CACHE_CONTROL,
      "X-Sound-Key": row.key,
    };

    // Conditional requests → 304 Not Modified
    const inm = req.headers.get("if-none-match");
    if (inm && inm.split(",").map((s) => s.trim()).some((tag) => tag === row.etag || tag === `W/${row.etag}` || tag === "*")) {
      return new NextResponse(null, { status: 304, headers: baseHeaders });
    }
    const ims = req.headers.get("if-modified-since");
    if (!inm && ims) {
      const since = Date.parse(ims);
      if (!Number.isNaN(since) && Math.floor(row.updatedAt.getTime() / 1000) <= Math.floor(since / 1000)) {
        return new NextResponse(null, { status: 304, headers: baseHeaders });
      }
    }

    const bytes = new Uint8Array(row.data);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": row.mimeType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        "Accept-Ranges": "none",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return dbError(e, req);
  }
}

/* --------------------------------- POST (upload) --------------------------------- */

export async function POST(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared && declared > MAX_SOUND_BYTES + 64 * 1024) {
    return error(`حجم الملف يتجاوز الحد الأقصى (4 ميجابايت)`, 413, req, { maxBytes: MAX_SOUND_BYTES });
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";
    let key = "";
    let fileName = "sound";
    let mimeType = "application/octet-stream";
    let buffer: Buffer | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      key = normalizeKey(String(form.get("key") ?? ""));
      const file = form.get("file");
      if (!(file instanceof File)) return error("لم يتم إرفاق ملف", 400, req);
      if (file.size > MAX_SOUND_BYTES) {
        return error("حجم الملف يتجاوز الحد الأقصى (4 ميجابايت)", 413, req, { maxBytes: MAX_SOUND_BYTES, size: file.size });
      }
      fileName = file.name || `${key}.audio`;
      mimeType = file.type || mimeType;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as { key?: string; dataBase64?: string; mimeType?: string; fileName?: string };
      key = normalizeKey(body.key);
      if (!body.dataBase64) return error("dataBase64 مطلوب", 400, req);
      const b64 = body.dataBase64.includes(",") ? body.dataBase64.split(",")[1] : body.dataBase64;
      buffer = Buffer.from(b64, "base64");
      mimeType = body.mimeType || mimeType;
      fileName = body.fileName || `${key}.audio`;
    }

    if (!key || !SOUND_KEY_PATTERN.test(key)) return error("مفتاح الصوت غير صالح (أحرف إنجليزية صغيرة وأرقام و - أو _)", 400, req);
    if (!buffer || buffer.byteLength === 0) return error("الملف فارغ", 400, req);
    if (buffer.byteLength > MAX_SOUND_BYTES) {
      return error("حجم الملف يتجاوز الحد الأقصى (4 ميجابايت)", 413, req, { maxBytes: MAX_SOUND_BYTES, size: buffer.byteLength });
    }
    if (!isAllowedAudioMime(mimeType)) return error(`نوع الملف غير مدعوم: ${mimeType}`, 415, req);

    const etag = `"${createHash("sha1").update(buffer).digest("hex")}"`;
    const now = new Date();
    const [row] = await db
      .insert(lessonSounds)
      .values({ key, fileName, mimeType, sizeBytes: buffer.byteLength, etag, data: buffer, updatedAt: now })
      .onConflictDoUpdate({
        target: lessonSounds.key,
        set: { fileName, mimeType, sizeBytes: buffer.byteLength, etag, data: buffer, updatedAt: now },
      })
      .returning({
        key: lessonSounds.key,
        fileName: lessonSounds.fileName,
        mimeType: lessonSounds.mimeType,
        sizeBytes: lessonSounds.sizeBytes,
        etag: lessonSounds.etag,
        createdAt: lessonSounds.createdAt,
        updatedAt: lessonSounds.updatedAt,
      });

    return json({ ok: true, sound: metaOf(row) }, { req, status: 201 });
  } catch (e) {
    return dbError(e, req);
  }
}

/* -------------------------------- DELETE (remove) -------------------------------- */

export async function DELETE(req: NextRequest) {
  const notReady = await prepareDb(req);
  if (notReady) return notReady;
  if (!isTeacherAuthorized(req)) return error("UNAUTHORIZED", 401, req);
  const params = new URL(req.url).searchParams;
  const key = normalizeKey(params.get("key"));
  try {
    if (params.get("all") === "true") {
      const deleted = await db.delete(lessonSounds).returning({ key: lessonSounds.key });
      return json({ ok: true, deleted: deleted.length }, { req });
    }
    if (!key) return error("key مطلوب", 400, req);
    const deleted = await db.delete(lessonSounds).where(eq(lessonSounds.key, key)).returning({ key: lessonSounds.key });
    return json({ ok: true, deleted: deleted.length, key }, { req });
  } catch (e) {
    return dbError(e, req);
  }
}
