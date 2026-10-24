/**
 * The text of a per-language map in the app's language, else the default
 * language's, else the first language that has any (a lesson is entered in
 * the languages its author speaks, so a title can exist in one only). Empty
 * strings count as missing. `undefined` when no language has text.
 */
export function pickText(
  texts: Readonly<Record<string, string | undefined>>,
  locale: string,
  defaultLocale: string
): string | undefined {
  for (const code of [locale, defaultLocale]) {
    const text = texts[code]?.trim();
    if (text) {
      return text;
    }
  }
  for (const text of Object.values(texts)) {
    if (text?.trim()) {
      return text.trim();
    }
  }
  return undefined;
}
