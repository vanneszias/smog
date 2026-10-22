/**
 * The "needs translation" report (phase 10b task 5): which gestures and
 * categories still show the default language's text in one language. One
 * definition, used by the admin gesture list's filter, the per-language
 * counts and the dashboard's coverage card, so they cannot drift apart.
 *
 * A gesture needs translation in a language when
 * - it has no `gesture_translation` row (its name is the default text), or
 * - its translated description is blank while the default one is not, or
 * - it has no keyword in that language while the default language has some.
 *
 * A category needs translation when it has no `category_translation` row.
 * The default language itself never needs one. Every probe is a primary key
 * or covering index seek; the one scan is the walk over `gesture`.
 */

import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { category, gesture, language } from "./schema";

/** The code of the default language, as a scalar subquery. */
export const DEFAULT_LANGUAGE_SQL: SQL = sql`(SELECT ${language.code} FROM ${language} WHERE ${language.isDefault} = 1)`;

/**
 * Whether the outer `gesture` row has no translation row in `locale`
 * (its name and description are the default text).
 */
export function gestureUntranslatedSql(locale: string): SQL {
  return sql`NOT EXISTS (SELECT 1 FROM gesture_translation AS t WHERE t.gesture_id = ${gesture.id} AND t.locale = ${locale})`;
}

/**
 * The outer `gesture` row needs translation in `locale` (see the module
 * comment). Always false for the default language.
 */
export function gestureNeedsTranslationSql(locale: string): SQL {
  return sql`(${locale} <> ${DEFAULT_LANGUAGE_SQL} AND (${gestureUntranslatedSql(locale)} OR (${gesture.description} <> '' AND EXISTS (SELECT 1 FROM gesture_translation AS t WHERE t.gesture_id = ${gesture.id} AND t.locale = ${locale} AND t.description = '')) OR (NOT EXISTS (SELECT 1 FROM gesture_keyword AS k WHERE k.gesture_id = ${gesture.id} AND k.locale = ${locale}) AND EXISTS (SELECT 1 FROM gesture_keyword AS k WHERE k.gesture_id = ${gesture.id} AND k.locale = ${DEFAULT_LANGUAGE_SQL}))))`;
}

/** What `translationReport` counts for one language. */
export interface TranslationReport {
  categories: {
    /** Categories with no translated name. */
    missing: number;
    total: number;
  };
  gestures: {
    /** Translated name but a blank description while the default one is not. */
    missingDescription: number;
    /** Translated, but no keyword while the default language has some. */
    missingKeywords: number;
    /** No translation row: the default name is shown. */
    missingName: number;
    /** Gestures that need translation (any of the three above). */
    needsTranslation: number;
    total: number;
  };
  locale: string;
}

const NOT_DEFAULT = (locale: string): SQL =>
  sql`${locale} <> ${DEFAULT_LANGUAGE_SQL}`;

/** `sum(1)` of the rows where `condition` holds (0 for none). */
function countWhere(condition: SQL) {
  return sql<number>`coalesce(sum(CASE WHEN ${condition} THEN 1 ELSE 0 END), 0)`.mapWith(
    Number
  );
}

const blankDescription = (locale: string): SQL =>
  sql`${gesture.description} <> '' AND EXISTS (SELECT 1 FROM gesture_translation AS t WHERE t.gesture_id = ${gesture.id} AND t.locale = ${locale} AND t.description = '')`;

const missingKeywords = (locale: string): SQL =>
  sql`NOT ${gestureUntranslatedSql(locale)} AND NOT EXISTS (SELECT 1 FROM gesture_keyword AS k WHERE k.gesture_id = ${gesture.id} AND k.locale = ${locale}) AND EXISTS (SELECT 1 FROM gesture_keyword AS k WHERE k.gesture_id = ${gesture.id} AND k.locale = ${DEFAULT_LANGUAGE_SQL})`;

/** The counts of one language (the default language reports zeros). */
export async function translationReport(
  db: Db,
  locale: string
): Promise<TranslationReport> {
  const notDefault = NOT_DEFAULT(locale);
  try {
    const [counts, categories] = await db.batch([
      db
        .select({
          missingDescription: countWhere(
            sql`${notDefault} AND ${blankDescription(locale)}`
          ),
          missingKeywords: countWhere(
            sql`${notDefault} AND ${missingKeywords(locale)}`
          ),
          missingName: countWhere(
            sql`${notDefault} AND ${gestureUntranslatedSql(locale)}`
          ),
          needsTranslation: countWhere(gestureNeedsTranslationSql(locale)),
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(gesture),
      db
        .select({
          missing: countWhere(
            sql`${notDefault} AND NOT EXISTS (SELECT 1 FROM category_translation AS t WHERE t.category_id = ${category.id} AND t.locale = ${locale})`
          ),
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(category),
    ]);
    const [g] = counts;
    const [c] = categories;
    return {
      categories: { missing: c?.missing ?? 0, total: c?.total ?? 0 },
      gestures: {
        missingDescription: g?.missingDescription ?? 0,
        missingKeywords: g?.missingKeywords ?? 0,
        missingName: g?.missingName ?? 0,
        needsTranslation: g?.needsTranslation ?? 0,
        total: g?.total ?? 0,
      },
      locale,
    };
  } catch (error) {
    console.error(
      `[db] Failed to count the translation report for ${locale}:`,
      error
    );
    throw error;
  }
}
