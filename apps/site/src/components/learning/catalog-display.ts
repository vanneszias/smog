import { defaultLanguage } from "@smog/i18n";
import { useCallback, useMemo } from "react";
import { useLocale } from "@/lib/locale";

/**
 * Category names are stored as typed ("dieren", "eten en drinken"): on
 * screen they start with a capital, as a contents list would print them.
 */
function sentenceCase(name: string, locale: string): string {
  const first = name.charAt(0);
  return first ? first.toLocaleUpperCase(locale) + name.slice(1) : name;
}

interface Named {
  fallbackUsed?: boolean;
  name: string;
}

export interface CatalogDisplay {
  /** A category for display: sentence case, `lang` when untranslated. */
  category: <T extends Named>(category: T) => T & { lang?: string | undefined };
  /** A gesture for display: `nameLang`, its categories in sentence case. */
  gesture: <
    T extends {
      categories: readonly { name: string; slug: string }[];
      fallbackUsed?: boolean;
      name: string;
    },
  >(
    gesture: T
  ) => T & { nameLang?: string | undefined };
}

/**
 * How the catalogue's names show on the public pages. A name the viewer's
 * language has no translation for is the default language's text
 * (`fallbackUsed`): it carries that `lang`, so a screen reader reads it as
 * Dutch. A gesture's category refs carry no flag of their own, so they
 * get no `lang`.
 */
export function useCatalogDisplay(): CatalogDisplay {
  const { languages, locale } = useLocale();
  const base = defaultLanguage(languages);
  const category = useCallback(
    <T extends Named>(item: T): T & { lang?: string | undefined } => ({
      ...item,
      lang: item.fallbackUsed ? base : undefined,
      name: sentenceCase(item.name, item.fallbackUsed ? base : locale),
    }),
    [base, locale]
  );
  const gesture = useCallback(
    <
      T extends {
        categories: readonly { name: string; slug: string }[];
        fallbackUsed?: boolean;
        name: string;
      },
    >(
      item: T
    ): T & { nameLang?: string | undefined } => {
      const lang = item.fallbackUsed && locale !== base ? base : undefined;
      return {
        ...item,
        categories: item.categories.map((ref) => ({
          ...ref,
          name: sentenceCase(ref.name, locale),
        })),
        nameLang: lang,
      };
    },
    [base, locale]
  );
  return useMemo(() => ({ category, gesture }), [category, gesture]);
}
