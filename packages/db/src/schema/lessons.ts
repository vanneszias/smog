/**
 * Lessons (phase 10c, spec 4.4, migration 0026): a teacher's ordered, optionally
 * sectioned list of gestures, with a title and notes per language.
 *
 * Order: `lesson_section.position` orders the sections of a lesson;
 * `lesson_item.position` orders the items within their section, and the
 * items with no section (`section_id` NULL) come first. A gesture appears
 * once per lesson (the primary key). A gesture that is later unpublished
 * stays in the lesson; one that is deleted leaves it (cascade).
 * `lesson.version` is bumped on every write to the lesson (the stale-lock of
 * the builder and part of the PDF cache fingerprint, ruling 3).
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
  LESSON_NOTES_MAX,
  LESSON_NUMBER_MAX,
  LESSON_TITLE_MAX,
} from "../enums";
import { user } from "./auth";
import { col, createdAt, lengthBetween, updatedAt } from "./columns";
import { language } from "./language";
import { gesture } from "./learning";

export const lesson = sqliteTable(
  "lesson",
  {
    id: text("id").primaryKey(),
    /** The author edits and deletes (an admin too); NULL once the account is gone (an admin then). */
    authorId: text("author_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** The optional lesson number ("Les 1"). */
    number: integer("number"),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "lesson_number_check",
      sql`${col(t.number)} IS NULL OR ${col(t.number)} BETWEEN 0 AND ${sql.raw(String(LESSON_NUMBER_MAX))}`
    ),
    check("lesson_version_check", sql`${col(t.version)} >= 1`),
    // The list: every lesson, newest change first; "mine" seeks the author.
    index("lesson_updated_idx").on(t.updatedAt, t.id),
    index("lesson_author_updated_idx").on(t.authorId, t.updatedAt),
  ]
);

/** A lesson's title and notes in one language (a row per language the teacher filled in). */
export const lessonTranslation = sqliteTable(
  "lesson_translation",
  {
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.lessonId, t.locale] }),
    check(
      "lesson_translation_title_check",
      lengthBetween(t.title, 1, LESSON_TITLE_MAX)
    ),
    check(
      "lesson_translation_notes_check",
      sql`length(${col(t.notes)}) <= ${sql.raw(String(LESSON_NOTES_MAX))}`
    ),
    index("lesson_translation_locale_idx").on(t.locale, t.lessonId),
  ]
);

export const lessonSection = sqliteTable(
  "lesson_section",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    check("lesson_section_position_check", sql`${col(t.position)} >= 0`),
    // The sections of a lesson in order. Not unique: a reorder rewrites positions row by row.
    index("lesson_section_order_idx").on(t.lessonId, t.position),
  ]
);

export const lessonSectionTranslation = sqliteTable(
  "lesson_section_translation",
  {
    sectionId: text("section_id")
      .notNull()
      .references(() => lessonSection.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    title: text("title").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.locale] }),
    check(
      "lesson_section_translation_title_check",
      lengthBetween(t.title, 1, LESSON_TITLE_MAX)
    ),
    index("lesson_section_translation_locale_idx").on(t.locale, t.sectionId),
  ]
);

export const lessonItem = sqliteTable(
  "lesson_item",
  {
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    /** NULL: the item is before the first section. Deleting a section keeps its items (they become ungrouped). */
    sectionId: text("section_id").references(() => lessonSection.id, {
      onDelete: "set null",
    }),
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [
    // A gesture appears once per lesson.
    primaryKey({ columns: [t.lessonId, t.gestureId] }),
    check("lesson_item_position_check", sql`${col(t.position)} >= 0`),
    // The item load of a lesson, in order, and the items of one section.
    index("lesson_item_order_idx").on(t.lessonId, t.sectionId, t.position),
    index("lesson_item_section_idx").on(t.sectionId),
    // "Which lessons contain this gesture" (the cache fingerprint, the delete cascade).
    index("lesson_item_gesture_idx").on(t.gestureId, t.lessonId),
  ]
);
