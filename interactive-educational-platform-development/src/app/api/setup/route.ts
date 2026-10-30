import { NextRequest } from "next/server";
import { dbTarget } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { json, preflight } from "@/lib/cors";
import { describeDbError } from "@/lib/db-errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

/**
 * Creates / upgrades the database tables (idempotent). Safe to open in a browser after deploying:
 *   GET /api/setup
 */
async function handle(req: NextRequest) {
  const started = Date.now();
  const target = { source: dbTarget.source, host: dbTarget.host, database: dbTarget.database, ssl: dbTarget.ssl, pooler: dbTarget.pooler, serverless: dbTarget.serverless };
  try {
    const status = await ensureSchema(true);
    return json(
      {
        ok: true,
        message: status.provisioned ? "تم إنشاء/تحديث جداول قاعدة البيانات بنجاح ✅" : "جداول قاعدة البيانات موجودة ومكتملة ✅",
        target,
        schema: status,
        durationMs: Date.now() - started,
      },
      { req },
    );
  } catch (e) {
    const info = describeDbError(e);
    return json({ ok: false, error: info.message, code: info.code, detail: info.detail, hint: info.hint, target, durationMs: Date.now() - started }, { req, status: info.status });
  }
}

export const GET = handle;
export const POST = handle;
