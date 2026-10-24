/**
 * Private teaching material (phase 10c, spec 4.1 and 4.3): the teacher
 * information of a gesture per language and its drawings.
 *
 * **Nothing here is public.** The public gesture queries use explicit column
 * lists and no public output schema names these tables or their columns;
 * `packages/features/lessons/test/public-output-guard.test.ts` fails when one
 * does. Only `@smog/lessons/server` reads them.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import {
  DRAWING_CONTENT_TYPES,
  DRAWING_CREDIT_MAX,
  DRAWING_MAX_BYTES,
  DRAWING_MAX_PIXELS,
  DRAWING_STEPS,
  TEACHER_FIELD_MAX,
} from "../enums";
import { user } from "./auth";
import { col, inValues, updatedAt } from "./columns";
import { language } from "./language";
import { gesture } from "./learning";

const FIELD_MAX = sql.raw(String(TEACHER_FIELD_MAX));

/**
 * What a teacher knows about one gesture in one language (migration 0024):
 * the handshape (`hc`), place (`pl`), orientation (`or_`), movement (`bw`),
 * the private note around the public C keywords (`c_note`), a free note and
 * a short summary for the participants' sheet. One row per language, like
 * `gesture_translation`; a missing language falls back to the default
 * language per field. `version` is bumped on every write: it is the
 * stale-lock of the editor and part of the PDF cache fingerprint (ruling 3).
 */
export const gestureTeacherInfo = sqliteTable(
  "gesture_teacher_info",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    hc: text("hc").notNull().default(""),
    pl: text("pl").notNull().default(""),
    /** `OR` is an SQL keyword: the column is `or_`. */
    or_: text("or_").notNull().default(""),
    bw: text("bw").notNull().default(""),
    cNote: text("c_note").notNull().default(""),
    note: text("note").notNull().default(""),
    summary: text("summary").notNull().default(""),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gestureId, t.locale] }),
    check(
      "gesture_teacher_info_hc_check",
      sql`length(${col(t.hc)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_pl_check",
      sql`length(${col(t.pl)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_or_check",
      sql`length(${col(t.or_)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_bw_check",
      sql`length(${col(t.bw)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_c_note_check",
      sql`length(${col(t.cNote)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_note_check",
      sql`length(${col(t.note)}) <= ${FIELD_MAX}`
    ),
    check(
      "gesture_teacher_info_summary_check",
      sql`length(${col(t.summary)}) <= ${FIELD_MAX}`
    ),
    check("gesture_teacher_info_version_check", sql`${col(t.version)} >= 1`),
    // Coverage per language (the readiness bar of a lesson).
    index("gesture_teacher_info_locale_idx").on(t.locale, t.gestureId),
    index("gesture_teacher_info_updated_by_idx").on(t.updatedBy),
  ]
);

/**
 * A drawing of a gesture (migration 0025): language-neutral, one image per
 * step (1, and optionally 2). The object lives in R2 under `r2_key`
 * (`teacher/drawings/<gestureId>/<step>/<uuid>`, a new key on every replace)
 * and is served only by the private route `GET /api/teacher/drawings/...`.
 * The caps are the upload rules (1 MiB, 2,000 px on a side, PNG, JPEG or
 * WebP verified by magic bytes), kept in the database as well. `updated_at`
 * is part of the PDF cache fingerprint.
 */
export const gestureDrawing = sqliteTable(
  "gesture_drawing",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    r2Key: text("r2_key").notNull().unique(),
    contentType: text("content_type", {
      enum: DRAWING_CONTENT_TYPES,
    }).notNull(),
    size: integer("size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    credit: text("credit").notNull().default(""),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gestureId, t.step] }),
    check(
      "gesture_drawing_step_check",
      sql`${col(t.step)} IN (${sql.raw(DRAWING_STEPS.join(", "))})`
    ),
    check(
      "gesture_drawing_content_type_check",
      inValues(t.contentType, DRAWING_CONTENT_TYPES)
    ),
    check(
      "gesture_drawing_size_check",
      sql`${col(t.size)} BETWEEN 1 AND ${sql.raw(String(DRAWING_MAX_BYTES))}`
    ),
    check(
      "gesture_drawing_width_check",
      sql`${col(t.width)} BETWEEN 1 AND ${sql.raw(String(DRAWING_MAX_PIXELS))}`
    ),
    check(
      "gesture_drawing_height_check",
      sql`${col(t.height)} BETWEEN 1 AND ${sql.raw(String(DRAWING_MAX_PIXELS))}`
    ),
    check(
      "gesture_drawing_credit_check",
      sql`length(${col(t.credit)}) <= ${sql.raw(String(DRAWING_CREDIT_MAX))}`
    ),
    index("gesture_drawing_updated_by_idx").on(t.updatedBy),
  ]
);
