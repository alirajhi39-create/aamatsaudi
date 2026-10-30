import { createHash } from "crypto";
import { normalizeClassName, normalizeNameKey } from "@/lib/normalize";

/** Deterministic student id from class + name, so the same student can resume from any device. */
export function deriveStudentId(className: string, name: string): string {
  const key = `${normalizeClassName(className)}|${normalizeNameKey(name)}`;
  return "s_" + createHash("sha1").update(key).digest("hex").slice(0, 12);
}

/** Id for teacher-registered names. */
export function deriveTeacherStudentId(className: string, name: string): string {
  const key = `${normalizeClassName(className)}|${normalizeNameKey(name)}`;
  return "t_" + createHash("sha1").update(key).digest("hex").slice(0, 12);
}
