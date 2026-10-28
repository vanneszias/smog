import { describe, expect, test } from "bun:test";
import {
  applyValues,
  createI18n,
  flattenMessages,
  formatDate,
  formatList,
  isLocale,
  pickOverlay,
  pluralProblems,
  registerLanguages,
  requiredPluralForms,
  resolveLocale,
  shippedMessages,
  validateTranslation,
} from "../../../../i18n/src/index";

describe("createI18n with the ui_string overlay", () => {
  test("an overlay value beats the shipped value of the language", () => {
    const i18n = createI18n("fr", {
      fr: { "common.cancel": "Laisser tomber" },
    });
    expect(i18n.t("common.cancel")).toBe("Laisser tomber");
    expect(i18n.t("common.confirm")).toBe("Confirmer");
  });

  test("without an overlay it is the shipped catalogue", () => {
    expect(createI18n("en").t("common.cancel")).toBe("Cancel");
    expect(createI18n("en", {}).t("common.cancel")).toBe("Cancel");
  });

  test("a key the language lacks falls back to the default language overlay, then shipped nl", () => {
    // A language that ships nothing: every key is the default language's.
    const de = createI18n("de", { de: { "common.cancel": "Abbrechen" } });
    expect(de.t("common.cancel")).toBe("Abbrechen");
    expect(de.t("common.confirm")).toBe("Bevestigen");
    const withDefaultOverlay = createI18n("de", {
      nl: { "common.confirm": "Oké" },
    });
    expect(withDefaultOverlay.t("common.confirm")).toBe("Oké");
  });

  test("a missing key never renders empty or as the key", () => {
    const i18n = createI18n("fr", {
      fr: { "common.cancel": "", "common.close": "   " },
    });
    // Blank overlay values are ignored: the shipped text stays.
    expect(i18n.t("common.cancel")).toBe("Annuler");
    expect(i18n.t("common.close")).toBe("Fermer");
    // A language without the key at all shows the default language's text.
    const nlOnlyKey = createI18n("de");
    for (const key of ["common.cancel", "auth.errors.generic"] as const) {
      const text = nlOnlyKey.t(key);
      expect(text).not.toBe("");
      expect(text).not.toBe(key);
    }
  });

  test("an empty string in the shipped fallback chain is skipped too", () => {
    const i18n = createI18n("en", { nl: { "common.cancel": "Stop" } });
    expect(i18n.t("common.cancel")).toBe("Cancel");
  });

  test("plural overlay forms are used with the count", () => {
    const i18n = createI18n("nl", {
      nl: {
        "auth.import.favorites_one": "{{count}} lievelingsgebaar",
        "auth.import.favorites_other": "{{count}} lievelingsgebaren",
      },
    });
    expect(i18n.t("auth.import.favorites", { count: 1 })).toBe(
      "1 lievelingsgebaar"
    );
    expect(i18n.t("auth.import.favorites", { count: 3 })).toBe(
      "3 lievelingsgebaren"
    );
  });

  test("the overlay never mutates the shipped catalogue or itself", () => {
    const overlay = { nl: { "common.cancel": "Stop" } };
    const before = JSON.stringify(shippedMessages("nl"));
    createI18n("nl", overlay);
    expect(JSON.stringify(shippedMessages("nl"))).toBe(before);
    expect(overlay).toEqual({ nl: { "common.cancel": "Stop" } });
    expect(createI18n("nl").t("common.cancel")).toBe("Annuleren");
  });
});

describe("applyValues", () => {
  test("copies along the path and leaves the base alone", () => {
    const base = { a: { b: "x", c: "y" }, d: "z" };
    const out = applyValues(base, { "a.b": "new", "e.f": "made" });
    expect(out).toEqual({ a: { b: "new", c: "y" }, d: "z", e: { f: "made" } });
    expect(base).toEqual({ a: { b: "x", c: "y" }, d: "z" });
    expect(out.d).toBe(base.d);
  });

  test("ignores blank values and keys that would break the tree", () => {
    const base = { a: { b: "x" }, s: "str" };
    const out = applyValues(base, {
      "": "root",
      a: "replaces a branch",
      "a..b": "empty part",
      "a.b": "   ",
      "s.t": "under a string",
    });
    expect(out).toEqual(base);
  });

  test("flattenMessages reverses the nesting", () => {
    expect(flattenMessages({ a: { b: "x" }, c: "y" })).toEqual({
      "a.b": "x",
      c: "y",
    });
  });

  test("pickOverlay keeps only the asked languages and drops empty ones", () => {
    const overlay = { de: { k: "v" }, fr: {}, nl: { k: "w" } };
    expect(pickOverlay(overlay, ["fr", "nl"])).toEqual({ nl: { k: "w" } });
  });
});

describe("validateTranslation", () => {
  test("accepts a translation with the same placeholders", () => {
    expect(validateTranslation("Hallo {{name}}", "Bonjour {{ name }}").ok).toBe(
      true
    );
  });

  test("a missing or extra placeholder is an issue", () => {
    const missing = validateTranslation("Hallo {{name}}", "Bonjour");
    expect(missing.issues).toEqual([
      { code: "placeholders", extra: [], missing: ["name"] },
    ]);
    const extra = validateTranslation("Hallo", "Bonjour {{who}}");
    expect(extra.issues).toEqual([
      { code: "placeholders", extra: ["who"], missing: [] },
    ]);
  });

  test("count may be left out of a plural form", () => {
    expect(validateTranslation("{{count}} gebaren", "un geste").ok).toBe(true);
  });

  test("blank and over-long values are refused", () => {
    expect(validateTranslation("x", "  ").issues).toEqual([{ code: "empty" }]);
    expect(
      validateTranslation("x", "y".repeat(11), { maxLength: 10 }).issues
    ).toEqual([{ code: "tooLong", max: 10 }]);
    expect(validateTranslation("x", "y".repeat(4000)).ok).toBe(true);
    expect(validateTranslation("x", "y".repeat(4001)).ok).toBe(false);
  });
});

describe("plural forms", () => {
  test("the CLDR categories of a language", () => {
    expect(requiredPluralForms("nl")).toEqual(["one", "other"]);
    expect(requiredPluralForms("fr")).toEqual(["many", "one", "other"]);
  });

  test("reports a missing form and a plain key mixed with plural forms", () => {
    expect(pluralProblems("nl", ["x_one", "x_other", "y"])).toEqual([]);
    expect(pluralProblems("fr", ["x_one", "x_other"])).toEqual([
      { base: "x", missing: ["many"], unexpected: [] },
    ]);
    expect(pluralProblems("nl", ["x", "x_one"])).toEqual([
      { base: "x", missing: [], unexpected: ["one"] },
    ]);
    expect(pluralProblems("nl", ["x_one", "x_other", "x_few"])).toEqual([
      { base: "x", missing: [], unexpected: ["few"] },
    ]);
  });
});

describe("languages are data", () => {
  test("resolveLocale only picks enabled languages", () => {
    const enabled = ["nl", "de"];
    expect(resolveLocale({ cookie: "de" }, enabled)).toBe("de");
    // fr is not enabled: the cookie falls through to the next source.
    expect(
      resolveLocale({ acceptLanguage: "de-AT", cookie: "fr" }, enabled)
    ).toBe("de");
    expect(resolveLocale({ cookie: "fr" }, enabled)).toBe("nl");
    expect(resolveLocale({ acceptLanguage: "pt-BR" }, ["nl", "pt-BR"])).toBe(
      "pt-BR"
    );
    expect(resolveLocale({ cookie: "xx" })).toBe("nl");
  });

  test("isLocale checks the enabled list, the shipped three by default", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("de", ["nl", "de"])).toBe(true);
    expect(isLocale(12, ["nl"])).toBe(false);
  });

  test("Intl tags come from the registered languages", () => {
    const ms = Date.UTC(2026, 8, 29, 22, 30);
    expect(formatDate(ms, "de")).toBe("30. September 2026");
    registerLanguages([
      { code: "de", intlTag: "de-BE", isDefault: false, name: "Deutsch" },
    ]);
    expect(formatDate(ms, "de")).toBe("30. September 2026");
    expect(formatList(["a", "b"], "de")).toBe("a und b");
  });
});
