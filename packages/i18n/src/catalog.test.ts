import { describe, expect, test } from "bun:test";
import { LOCALES, type Locale, resolveLocale, resources } from "./index";

interface Tree {
  [key: string]: string | Tree;
}

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);
const PLACEHOLDER = /\{\{\s*([\w.]+)[^}]*\}\}/g;

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else {
      for (const [k, v] of flatten(value, path)) {
        out.set(k, v);
      }
    }
  }
  return out;
}

/** Groups plural forms (`x_one`, `x_other`) under their base key `x`. */
function byBaseKey(locale: Locale): Map<string, Map<string, string>> {
  const groups = new Map<string, Map<string, string>>();
  const flat = flatten(resources[locale].translation as unknown as Tree);
  for (const [key, value] of flat) {
    const cut = key.lastIndexOf("_");
    const plural = cut > 0 && PLURAL_FORMS.has(key.slice(cut + 1));
    const base = plural ? key.slice(0, cut) : key;
    const form = plural ? key.slice(cut + 1) : "";
    const group = groups.get(base) ?? new Map<string, string>();
    group.set(form, value);
    groups.set(base, group);
  }
  return groups;
}

function placeholders(values: Iterable<string>): string[] {
  const names = new Set<string>();
  for (const value of values) {
    for (const match of value.matchAll(PLACEHOLDER)) {
      if (match[1] && match[1] !== "count") {
        names.add(match[1]);
      }
    }
  }
  return [...names].sort();
}

const canonical = byBaseKey("nl");

describe("catalogues", () => {
  test("nl defines the phase 2 key groups", () => {
    const groups = new Set([...canonical.keys()].map((k) => k.split(".")[0]));
    for (const group of [
      "common",
      "a11y",
      "nav",
      "theme",
      "language",
      "auth",
      "states",
      "kit",
      "email",
      "devTools",
    ]) {
      expect(groups.has(group)).toBe(true);
    }
  });

  test("the lists messages say each thing once (one key per message)", () => {
    // Quotes and placeholder names aside, two keys with one text are one message.
    const normalize = (text: string) =>
      text
        .replace(PLACEHOLDER, "{}")
        .replace(/[“”«»"\u00A0]/g, "")
        .trim()
        .toLowerCase();
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [key, forms] of canonical) {
      if (!key.startsWith("lists.")) {
        continue;
      }
      for (const text of forms.values()) {
        const other = seen.get(normalize(text));
        if (other && other !== key) {
          duplicates.push(`${other} = ${key}`);
        }
        seen.set(normalize(text), key);
      }
    }
    expect(duplicates).toEqual([]);
    // Retired duplicates: `lists.addedTo`, `lists.removedFrom` and
    // `lists.sharedView.*` are the ones both apps use.
    for (const retired of [
      "lists.added",
      "lists.removed",
      "lists.sharedBy",
      "lists.sharedSignIn",
    ]) {
      expect(canonical.has(retired)).toBe(false);
    }
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const groups = byBaseKey(locale);

      test("has exactly the same keys as nl", () => {
        expect([...groups.keys()].sort()).toEqual([...canonical.keys()].sort());
      });

      test("has no empty strings", () => {
        const empty = [...groups].flatMap(([key, forms]) =>
          [...forms.values()].some((v) => v.trim() === "") ? [key] : []
        );
        expect(empty).toEqual([]);
      });

      test("uses the same {{placeholders}} as nl per key", () => {
        const mismatched = [...canonical].flatMap(([key, forms]) => {
          const mine = groups.get(key);
          const expected = placeholders(forms.values());
          const actual = placeholders(mine?.values() ?? []);
          return expected.join() === actual.join()
            ? []
            : [`${key}: ${actual.join()} != ${expected.join()}`];
        });
        expect(mismatched).toEqual([]);
      });

      test("plural keys have every CLDR category of the locale", () => {
        const categories = new Intl.PluralRules(locale)
          .resolvedOptions()
          .pluralCategories.slice()
          .sort();
        const missing = [...groups].flatMap(([key, forms]) => {
          if (forms.has("")) {
            return forms.size === 1 ? [] : [`${key}: mixes plain and plural`];
          }
          const have = [...forms.keys()].sort();
          return have.join() === categories.join()
            ? []
            : [`${key}: ${have.join()} != ${categories.join()}`];
        });
        expect(missing).toEqual([]);
      });
    });
  }
});

describe("resolveLocale", () => {
  test("matches the primary subtag of Accept-Language", () => {
    expect(resolveLocale({ acceptLanguage: "fr-BE,fr;q=0.9" })).toBe("fr");
    expect(resolveLocale({ acceptLanguage: "en-GB" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "nl-BE,nl;q=0.9,en;q=0.8" })).toBe(
      "nl"
    );
  });

  test("falls back to nl for unsupported languages", () => {
    expect(resolveLocale({ acceptLanguage: "de-DE" })).toBe("nl");
    expect(resolveLocale({})).toBe("nl");
    expect(resolveLocale({ acceptLanguage: "*", cookie: "xx" })).toBe("nl");
  });

  test("honours q-values and skips unsupported entries", () => {
    expect(
      resolveLocale({ acceptLanguage: "de;q=1, en;q=0.5, fr;q=0.8" })
    ).toBe("fr");
    expect(resolveLocale({ acceptLanguage: "en;q=0, fr;q=0.1" })).toBe("fr");
  });

  test("the cookie beats the header, the header beats the device", () => {
    expect(resolveLocale({ acceptLanguage: "fr-BE", cookie: "en" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "fr-BE", device: "en-US" })).toBe(
      "fr"
    );
  });

  test("uses the first supported device locale", () => {
    expect(resolveLocale({ device: ["de-DE", "fr-BE", "en-US"] })).toBe("fr");
    expect(resolveLocale({ device: "EN_us" })).toBe("en");
    expect(resolveLocale({ device: [] })).toBe("nl");
  });
});

// French typography: a non-breaking space (U+00A0, or the narrow U+202F)
// before `? ! : ;`, so the mark never wraps onto a line of its own. URLs and
// {{placeholders}} are skipped; `?!` counts as one mark.
const FR_HIGH_PUNCTUATION = /(?<![\u00A0\u202F?!:;])[?!:;]/;
const SKIPPED = /\{\{[^}]*\}\}|[a-z][a-z0-9+.-]*:\/\/\S+/gi;

describe("fr typography", () => {
  test("a non-breaking space precedes every ? ! : ;", () => {
    const flat = flatten(resources.fr.translation as unknown as Tree);
    const offenders = [...flat]
      .filter(([, value]) =>
        FR_HIGH_PUNCTUATION.test(value.replace(SKIPPED, "\u00A0x"))
      )
      .map(([key, value]) => `${key}: ${value}`);
    expect(offenders).toEqual([]);
  });
});
