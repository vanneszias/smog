/**
 * Translation tables (phase 10b, spec 2): interface strings, gesture and
 * category translations, the spoken audio of a gesture and the legal texts.
 * The base columns (`gesture.name`, `gesture.description`, `category.name`)
 * stay the default language's value (`language.is_default`), so nothing that
 * reads them breaks; every other language lives here.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  AUDIO_CONTENT_TYPES,
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_MS,
  LEGAL_KINDS,
  LEGAL_STATUSES,
} from "../enums";
import { user } from "./auth";
import { col, inValues, lengthBetween, timestamp, updatedAt } from "./columns";
import { language } from "./language";
import { category, gesture } from "./learning";

/**
 * The editable layer over the shipped catalogues (migration 0016). A row is
 * the value of one key in one language, `source_hash` the hash of the
 * default-language source it was translated from (a changed source marks the
 * translation stale instead of deleting it). The shipped JSON stays the base:
 * a missing row falls back to the shipped value, then to the default language.
 */
export const uiString = sqliteTable(
  "ui_string",
  {
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    key: text("key").notNull(),
    value: text("value").notNull(),
    /** Hash of the default-language source when this was translated; NULL for the default language itself. */
    sourceHash: text("source_hash"),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    // The overlay load reads every row of one locale: a primary key prefix.
    primaryKey({ columns: [t.locale, t.key] }),
    check("ui_string_key_length_check", lengthBetween(t.key, 1, 200)),
    check("ui_string_value_length_check", lengthBetween(t.value, 1, 4000)),
    index("ui_string_updated_by_idx").on(t.updatedBy),
  ]
);

/**
 * A gesture's name and description in one non-default language (migration
 * 0017). The default language's text stays on `gesture`; a gesture without
 * a row here is shown with the default text and listed as "needs
 * translation". Keywords per language live in `gesture_keyword.locale`.
 */
export const gestureTranslation = sqliteTable(
  "gesture_translation",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gestureId, t.locale] }),
    check(
      "gesture_translation_name_length_check",
      lengthBetween(t.name, 1, 200)
    ),
    // Coverage per language and the "needs translation" report.
    index("gesture_translation_locale_idx").on(t.locale, t.gestureId),
    index("gesture_translation_updated_by_idx").on(t.updatedBy),
  ]
);

/** A category's name in one non-default language (migration 0017). */
export const categoryTranslation = sqliteTable(
  "category_translation",
  {
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    name: text("name").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.categoryId, t.locale] }),
    check(
      "category_translation_name_length_check",
      lengthBetween(t.name, 1, 200)
    ),
    index("category_translation_locale_idx").on(t.locale, t.categoryId),
    index("category_translation_updated_by_idx").on(t.updatedBy),
  ]
);

/**
 * The spoken name of a gesture in one language (migration 0018): one clip per
 * (gesture, language). The object lives in R2 under `r2_key`
 * (`audio/<gestureId>/<locale>/<uuid>`, a new key on every replace) and is
 * served through `GET /api/audio/<key>`. The caps are the upload rules (1 MiB,
 * 10 s, MP3 or M4A verified by magic bytes), kept in the database as well.
 */
export const gestureAudio = sqliteTable(
  "gesture_audio",
  {
    gestureId: text("gesture_id")
      .notNull()
      .references(() => gesture.id, { onDelete: "cascade" }),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    r2Key: text("r2_key").notNull().unique(),
    contentType: text("content_type", { enum: AUDIO_CONTENT_TYPES }).notNull(),
    size: integer("size").notNull(),
    durationMs: integer("duration_ms").notNull(),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gestureId, t.locale] }),
    check(
      "gesture_audio_content_type_check",
      inValues(t.contentType, AUDIO_CONTENT_TYPES)
    ),
    check(
      "gesture_audio_size_check",
      sql`${col(t.size)} BETWEEN 1 AND ${sql.raw(String(AUDIO_MAX_BYTES))}`
    ),
    check(
      "gesture_audio_duration_check",
      sql`${col(t.durationMs)} BETWEEN 1 AND ${sql.raw(String(AUDIO_MAX_DURATION_MS))}`
    ),
    index("gesture_audio_locale_idx").on(t.locale, t.gestureId),
    index("gesture_audio_updated_by_idx").on(t.updatedBy),
  ]
);

/**
 * A version of a legal text (migration 0019): one row per (kind, language,
 * version), history kept. `content` is the `LegalDocument` of `@smog/i18n`
 * (title and sections of restricted blocks), validated on save. The current
 * text is the highest published version; a draft is the version an editor is
 * working on (at most one per kind and language) and becomes published with
 * `published_by`/`published_at`. Version 1 of every kind and language is
 * seeded by the migration from the texts shipped in `@smog/i18n`, which stay
 * the fallback.
 */
export const legalText = sqliteTable(
  "legal_text",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: LEGAL_KINDS }).notNull(),
    locale: text("locale")
      .notNull()
      .references(() => language.code),
    version: integer("version").notNull(),
    content: text("content", { mode: "json" }).$type<unknown>().notNull(),
    /** The ISO date (`2026-09-30`) the text takes effect, set at publish. */
    effectiveDate: text("effective_date").notNull(),
    status: text("status", { enum: LEGAL_STATUSES }).notNull(),
    /** Who last saved this version (the draft's editor). */
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: updatedAt(),
    publishedBy: text("published_by").references(() => user.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    check("legal_text_kind_check", inValues(t.kind, LEGAL_KINDS)),
    check("legal_text_status_check", inValues(t.status, LEGAL_STATUSES)),
    check("legal_text_version_check", sql`${col(t.version)} >= 1`),
    check(
      "legal_text_effective_date_check",
      sql`${col(t.effectiveDate)} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'`
    ),
    // A published version knows when it was published, a draft does not.
    check(
      "legal_text_published_check",
      sql`(${col(t.status)} = 'published') = (${col(t.publishedAt)} IS NOT NULL)`
    ),
    uniqueIndex("legal_text_version_uq").on(t.kind, t.locale, t.version),
    // At most one draft per kind and language.
    uniqueIndex("legal_text_draft_uq")
      .on(t.kind, t.locale)
      .where(sql`${col(t.status)} = 'draft'`),
    // The public pages: the highest published version of (kind, locale).
    index("legal_text_published_idx")
      .on(t.kind, t.locale, t.version)
      .where(sql`${col(t.status)} = 'published'`),
    index("legal_text_updated_by_idx").on(t.updatedBy),
    index("legal_text_published_by_idx").on(t.publishedBy),
  ]
);
