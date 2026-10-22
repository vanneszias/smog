/** D1 reads of the translation screens (phase 10b task 4): the languages and the `ui_string` rows. */
import { inList, language, uiString } from "@smog/db";
import type { Db } from "@smog/db/client";
import { and, asc, type SQL } from "drizzle-orm";
import type { ModelLanguage, OverrideRow, Overrides } from "./model";

export interface StoredLanguage extends ModelLanguage {
  enabled: boolean;
  intlTag: string;
  sortOrder: number;
}

/** Every language in menu order (enabled or not). */
export async function readLanguages(db: Db): Promise<StoredLanguage[]> {
  try {
    return await db
      .select({
        code: language.code,
        enabled: language.enabled,
        intlTag: language.intlTag,
        isDefault: language.isDefault,
        name: language.name,
        sortOrder: language.sortOrder,
      })
      .from(language)
      .orderBy(asc(language.sortOrder), asc(language.code));
  } catch (error) {
    console.error("[translation] Failed to read the languages:", error);
    throw error;
  }
}

/** The code of the default language (exactly one row has the flag). */
export function defaultCodeOf(languages: readonly ModelLanguage[]): string {
  const found = languages.find((item) => item.isDefault);
  if (!found) {
    throw new Error("[translation] No default language is set");
  }
  return found.code;
}

/** The enabled languages, the table's columns. */
export function enabledOf(
  languages: readonly StoredLanguage[]
): StoredLanguage[] {
  return languages.filter((item) => item.enabled);
}

/**
 * The `ui_string` rows as the model's map. Without a filter: every row (a
 * few thousand at most, one read); `locales` and `keys` narrow it for a
 * single-key operation.
 */
export async function readOverrides(
  db: Db,
  filter: { keys?: readonly string[]; locales?: readonly string[] } = {}
): Promise<Overrides> {
  const conditions: SQL[] = [];
  if (filter.locales) {
    conditions.push(inList(uiString.locale, filter.locales));
  }
  if (filter.keys) {
    conditions.push(inList(uiString.key, filter.keys));
  }
  try {
    const rows = await db
      .select({
        key: uiString.key,
        locale: uiString.locale,
        sourceHash: uiString.sourceHash,
        updatedAt: uiString.updatedAt,
        value: uiString.value,
      })
      .from(uiString)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const map = new Map<string, Map<string, OverrideRow>>();
    for (const row of rows) {
      const inner = map.get(row.locale) ?? new Map<string, OverrideRow>();
      inner.set(row.key, {
        sourceHash: row.sourceHash,
        updatedAt: row.updatedAt.getTime(),
        value: row.value,
      });
      map.set(row.locale, inner);
    }
    return map;
  } catch (error) {
    console.error("[translation] Failed to read the strings:", error);
    throw error;
  }
}
