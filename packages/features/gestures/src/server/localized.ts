/**
 * The localized columns of the catalogue reads (phase 10b task 5). The base
 * columns (`gesture.name`, `gesture.description`, `category.name`, the
 * keywords of the default language) are the default language's text; every
 * other language lives in `gesture_translation`, `category_translation` and
 * `gesture_keyword.locale`. A read in a language takes the translation where
 * it exists and the default text where it does not (`fallbackUsed` says so).
 *
 * Every probe is a primary key seek on the translation tables, correlated to
 * the outer `gesture` row (so a page of 50 costs 50 seeks per field, in the
 * same statement). For the default language no row exists, so the same
 * columns return the base text and `fallbackUsed` is false: one code path.
 */
import {
  category,
  DEFAULT_LANGUAGE_SQL,
  gesture,
  gestureKeyword,
  ref,
} from "@smog/db";
import { type SQL, sql } from "drizzle-orm";

/** The outer row's name in every catalogue query (the `gesture` table). */
export const G = "gesture";

/** The gesture has a `gesture_translation` row in `locale`. */
function hasTranslation(locale: string): SQL {
  return sql`EXISTS (SELECT 1 FROM gesture_translation AS gt WHERE gt.gesture_id = ${ref(G, gesture.id)} AND gt.locale = ${locale})`;
}

/** The translated name, else the default one. */
export function nameColumn(locale: string): SQL<string> {
  return sql<string>`coalesce((SELECT gt.name FROM gesture_translation AS gt WHERE gt.gesture_id = ${ref(G, gesture.id)} AND gt.locale = ${locale}), ${ref(G, gesture.name)})`;
}

/** The translated description, else the default one (also when it is blank). */
export function descriptionColumn(locale: string): SQL<string> {
  return sql<string>`coalesce(nullif((SELECT gt.description FROM gesture_translation AS gt WHERE gt.gesture_id = ${ref(G, gesture.id)} AND gt.locale = ${locale}), ''), ${ref(G, gesture.description)})`;
}

/**
 * Whether the viewer sees the default text because the language has no
 * translation of the gesture (never for the default language itself).
 */
export function fallbackColumn(locale: string): SQL<boolean> {
  return sql<boolean>`(${locale} <> ${DEFAULT_LANGUAGE_SQL} AND NOT ${hasTranslation(locale)})`.mapWith(
    Boolean
  );
}

/**
 * The keywords in the editor's order: the language's own where the gesture
 * is translated into it, the default language's where it is not (the same
 * rule as the search index, which falls back to the default row).
 */
export function keywordsColumn(locale: string): SQL<string[]> {
  const keywordLocale = sql`CASE WHEN ${hasTranslation(locale)} THEN ${locale} ELSE ${DEFAULT_LANGUAGE_SQL} END`;
  return sql`(SELECT json_group_array(o.keyword) FROM (SELECT ${ref("k", gestureKeyword.keyword)} AS keyword FROM ${gestureKeyword} AS k WHERE ${ref("k", gestureKeyword.gestureId)} = ${ref(G, gesture.id)} AND ${ref("k", gestureKeyword.locale)} = ${keywordLocale} ORDER BY ${ref("k", gestureKeyword.position)}) AS o)`.mapWith(
    (value): string[] => JSON.parse(String(value)) as string[]
  );
}

/** A category's translated name, else the default one (outer alias `alias`). */
export function categoryNameSql(alias: string, locale: string): SQL<string> {
  return sql<string>`coalesce((SELECT ct.name FROM category_translation AS ct WHERE ct.category_id = ${ref(alias, category.id)} AND ct.locale = ${locale}), ${ref(alias, category.name)})`;
}

/** A category has no translated name in `locale` (never for the default language). */
export function categoryFallbackSql(
  alias: string,
  locale: string
): SQL<boolean> {
  return sql<boolean>`(${locale} <> ${DEFAULT_LANGUAGE_SQL} AND NOT EXISTS (SELECT 1 FROM category_translation AS ct WHERE ct.category_id = ${ref(alias, category.id)} AND ct.locale = ${locale}))`.mapWith(
    Boolean
  );
}
