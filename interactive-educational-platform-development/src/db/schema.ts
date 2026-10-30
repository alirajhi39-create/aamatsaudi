import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Binary column type (PostgreSQL BYTEA) used to store audio files directly in the DB.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export type ActivitiesJson = Record<string, unknown>;

/**
 * Student progress for the lesson "أئمة الدولة السعودية الثانية".
 */
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id").notNull().unique(),
    name: text("name").notNull(),
    /** Normalized name key (hamza/ta-marbuta unified) — unique per class so a name cannot be repeated */
    nameKey: text("name_key").notNull().default(""),
    /** Normalized class e.g. "6/ب" */
    className: text("class_name").notNull(),
    /** The raw class text as typed by the student (kept for auditing) */
    classRaw: text("class_raw"),
    currentSlide: integer("current_slide").notNull().default(0),
    maxSlide: integer("max_slide").notNull().default(0),
    quizScore: integer("quiz_score"),
    quizTotal: integer("quiz_total"),
    quizAttempts: integer("quiz_attempts").notNull().default(0),
    activities: jsonb("activities").$type<ActivitiesJson>().notNull().default({}),
    completed: boolean("completed").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lesson_progress_class_idx").on(t.className),
    uniqueIndex("lesson_progress_class_namekey_idx")
      .on(t.className, t.nameKey)
      .where(sql`${t.nameKey} <> ''`),
  ],
);

/**
 * Names registered by the teacher. When a student matches a row here, the name and class
 * are locked and cannot be changed by the student afterwards.
 */
export const teacherNames = pgTable(
  "teacher_names",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id").notNull().unique(),
    name: text("name").notNull(),
    /** Normalized name key used for matching (letters unified, spaces collapsed) */
    nameKey: text("name_key").notNull(),
    className: text("class_name").notNull(),
    locked: boolean("locked").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("teacher_names_class_namekey_idx").on(t.className, t.nameKey)],
);

/**
 * Custom sounds uploaded by the teacher (stored as BYTEA, max 4MB each).
 */
export const lessonSounds = pgTable("lesson_sounds", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  etag: text("etag").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LessonProgressRow = typeof lessonProgress.$inferSelect;
export type TeacherNameRow = typeof teacherNames.$inferSelect;
export type LessonSoundRow = typeof lessonSounds.$inferSelect;
