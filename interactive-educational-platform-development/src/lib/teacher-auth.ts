/**
 * PIN based authorization for teacher-only operations.
 *
 * The teacher PIN is fixed in code (TEACHER_PIN below). It can only be changed by editing this
 * constant or by setting the optional TEACHER_PIN_OVERRIDE environment variable. The legacy
 * TEACHER_PIN environment variable is intentionally ignored.
 */
export const TEACHER_PIN = "139613";

export function getTeacherPin(): string {
  const override = (process.env.TEACHER_PIN_OVERRIDE ?? "").trim();
  return override || TEACHER_PIN;
}

export function isTeacherAuthorized(req: Request): boolean {
  const headerPin = req.headers.get("x-teacher-pin");
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const url = new URL(req.url);
  const queryPin = url.searchParams.get("pin");
  const provided = (headerPin ?? bearer ?? queryPin ?? "").trim();
  return provided.length > 0 && provided === getTeacherPin();
}
