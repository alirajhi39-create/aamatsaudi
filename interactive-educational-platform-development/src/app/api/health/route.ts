import { NextRequest } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSchema } from "@/db/ensure-schema";
import { json, preflight } from "@/lib/cors";
import { describeDbError } from "@/lib/db-errors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  try {
    await db.execute(sql`select 1`);
    const schema = await ensureSchema();
    return json({ ok: true, service: "ssa2-lesson-api", schema: schema.ok ? "ready" : "incomplete", time: new Date().toISOString() }, { req });
  } catch (e) {
    const info = describeDbError(e);
    return json({ ok: false, error: info.message, code: info.code, detail: info.detail, hint: info.hint }, { req, status: 500 });
  }
}
