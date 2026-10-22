import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { language, uiString } from "./schema";

/** An enabled language, as the language menu and `Intl` need it. */
export interface EnabledLanguage {
  code: string;
  intlTag: string;
  isDefault: boolean;
  name: string;
}

/**
 * What `@smog/i18n/server`'s `loadCatalogue` reads from D1 (structurally its
 * `CatalogueSource`; this package does not depend on `@smog/i18n`): the
 * enabled languages in menu order (the `language_menu_idx` index) and the
 * `ui_string` rows of one language (a primary key prefix).
 */
export function uiCatalogueSource(db: Db): {
  languages: () => Promise<EnabledLanguage[]>;
  strings: (locale: string) => Promise<Record<string, string>>;
} {
  return {
    languages: () =>
      db
        .select({
          code: language.code,
          intlTag: language.intlTag,
          isDefault: language.isDefault,
          name: language.name,
        })
        .from(language)
        .where(eq(language.enabled, true))
        .orderBy(asc(language.sortOrder), asc(language.code)),
    strings: async (locale) => {
      const rows = await db
        .select({ key: uiString.key, value: uiString.value })
        .from(uiString)
        .where(eq(uiString.locale, locale));
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    },
  };
}

/**
 * Whether `code` is an enabled language: what a profile or a checkout may
 * name as its language (the foreign key alone would also accept a disabled one).
 */
export async function isEnabledLanguage(
  db: Db,
  code: string
): Promise<boolean> {
  const rows = await db
    .select({ code: language.code })
    .from(language)
    .where(and(eq(language.code, code), eq(language.enabled, true)))
    .limit(1);
  return rows.length > 0;
}
