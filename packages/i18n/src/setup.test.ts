import { describe, expect, test } from "bun:test";
import {
  createI18n,
  formatDate,
  formatList,
  type TranslationKey,
} from "./index";

describe("createI18n", () => {
  test("returns an initialised instance for the given locale", () => {
    const i18n = createI18n("fr");
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe("fr");
    expect(i18n.t("common.cancel")).toBe("Annuler");
  });

  test("instances are independent (one per SSR request)", () => {
    const nl = createI18n("nl");
    const en = createI18n("en");
    expect(nl.t("common.cancel")).toBe("Annuleren");
    expect(en.t("common.cancel")).toBe("Cancel");
    expect(nl.language).toBe("nl");
  });

  test("falls back to nl", () => {
    const i18n = createI18n("en");
    expect(i18n.options.fallbackLng).toEqual(["nl"]);
    expect(i18n.options.returnNull).toBe(false);
  });

  test("uses plural forms and interpolation", () => {
    const i18n = createI18n("nl");
    expect(i18n.t("auth.import.favorites", { count: 1 })).toBe("1 favoriet");
    expect(i18n.t("auth.import.favorites", { count: 12 })).toBe(
      "12 favorieten"
    );
    const fr = createI18n("fr");
    expect(fr.t("auth.import.lists", { count: 2 })).toBe("2 listes");
    expect(fr.t("auth.import.lists", { count: 1 })).toBe("1 liste");
    expect(fr.t("kit.characterCount", { count: 3, max: 35 })).toBe("3/35");
  });

  test("composes the guest import prompt", () => {
    const i18n = createI18n("nl");
    const items = formatList(
      [
        i18n.t("auth.import.favorites", { count: 12 }),
        i18n.t("auth.import.lists", { count: 2 }),
      ],
      "nl"
    );
    expect(i18n.t("auth.import.prompt", { items })).toBe(
      "12 favorieten en 2 lijsten importeren?"
    );
    const en = createI18n("en");
    expect(
      en.t("auth.import.prompt", {
        items: formatList([en.t("auth.import.favorites", { count: 1 })], "en"),
      })
    ).toBe("Import 1 favorite?");
  });

  test("does not HTML-escape interpolated values (React escapes)", () => {
    const i18n = createI18n("en");
    expect(i18n.t("auth.otp.description", { email: "a&b@x.be" })).toContain(
      "a&b@x.be"
    );
  });
});

describe("typed keys", () => {
  test("TranslationKey and t() only accept keys from nl.json", () => {
    const i18n = createI18n("nl");
    const keys: TranslationKey[] = [
      "auth.errors.generic",
      "auth.import.favorites",
      "a11y.clearSearch",
    ];
    // @ts-expect-error not a key in nl.json
    const bad: TranslationKey = "auth.errors.nope";
    // @ts-expect-error not a key in nl.json
    i18n.t("kit.nope");
    expect(keys.map((k) => typeof i18n.t(k))).toEqual([
      "string",
      "string",
      "string",
    ]);
    expect(String(bad)).toBe("auth.errors.nope");
  });
});

describe("formatList", () => {
  test("joins with the locale's conjunction", () => {
    expect(formatList(["a", "b", "c"], "fr")).toBe("a, b et c");
    expect(formatList(["a"], "en")).toBe("a");
  });

  test("falls back to the catalogue's conjunction without Intl.ListFormat", () => {
    const original = Intl.ListFormat;
    Reflect.deleteProperty(Intl, "ListFormat");
    try {
      expect(formatList(["a", "b", "c"], "nl")).toBe("a, b en c");
      expect(formatList(["a"], "nl")).toBe("a");
    } finally {
      Reflect.set(Intl, "ListFormat", original);
    }
  });
});

describe("formatDate", () => {
  const ms = Date.UTC(2026, 8, 29, 22, 30);

  test("formats a long date in the Brussels time zone", () => {
    expect(formatDate(ms, "nl")).toBe("30 september 2026");
    expect(formatDate(ms, "fr")).toBe("30 septembre 2026");
    expect(formatDate(ms, "en")).toBe("30 September 2026");
  });

  test("accepts Intl options", () => {
    expect(formatDate(ms, "nl", { dateStyle: "short" })).toBe("30/09/2026");
  });
});
