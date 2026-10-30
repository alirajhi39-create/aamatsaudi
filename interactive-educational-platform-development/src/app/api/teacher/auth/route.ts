import { NextRequest } from "next/server";
import { error, json, preflight } from "@/lib/cors";
import { getTeacherPin } from "@/lib/teacher-auth";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return preflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { pin?: string };
    const pin = String(body.pin ?? "").trim();
    if (pin && pin === getTeacherPin()) {
      return json({ ok: true }, { req });
    }
    return error("رمز الدخول غير صحيح", 401, req);
  } catch {
    return error("INVALID_JSON", 400, req);
  }
}
