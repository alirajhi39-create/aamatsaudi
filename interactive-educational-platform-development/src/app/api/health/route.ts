import { NextRequest } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { json, preflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function GET(req: NextRequest) {
  try {
    await db.execute(sql`select 1`);
    return json({ ok: true, service: "ssa2-lesson-api", time: new Date().toISOString() }, { req });
  } catch {
    return json({ ok: false }, { req, status: 500 });
  }
}
