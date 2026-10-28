import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { resolveLocale, SHIPPED_LANGUAGES } from "../../../../i18n/src/index";
import {
  bumpI18nVersion,
  type CatalogueKv,
  type CatalogueSource,
  I18N_VERSION_KEY,
  INITIAL_I18N_VERSION,
  type LegalSource,
  loadCatalogue,
  loadLanguages,
  loadLegalText,
  resetCatalogueCache,
} from "../../../../i18n/src/server";
import { createI18n } from "../../../../i18n/src/setup-web";

function fakeKv(): CatalogueKv & { gets: number; data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (key) => {
      kv.gets += 1;
      return Promise.resolve(data.get(key) ?? null);
    },
    gets: 0,
    put: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

let kv = fakeKv();

function fakeSource() {
  const strings: Record<string, Record<string, string>> = {
    fr: { "common.cancel": "Laisser tomber" },
  };
  const calls = { languages: 0, strings: 0 };
  const source: CatalogueSource = {
    languages: () => {
      calls.languages += 1;
      return Promise.resolve([
        { code: "nl", intlTag: "nl-BE", isDefault: true, name: "Nederlands" },
        { code: "fr", intlTag: "fr-BE", isDefault: false, name: "Français" },
        { code: "de", intlTag: "de-BE", isDefault: false, name: "Deutsch" },
      ]);
    },
    strings: (locale) => {
      calls.strings += 1;
      return Promise.resolve(strings[locale] ?? {});
    },
  };
  return { calls, source, strings };
}

const pick =
  (cookie: string) => (enabled: readonly string[], fallback: string) =>
    resolveLocale({ cookie }, enabled, fallback);

beforeEach(() => {
  resetCatalogueCache();
  kv = fakeKv();
});

describe("loadCatalogue", () => {
  test("merges the overlay with the shipped base for the resolved language", async () => {
    const { source } = fakeSource();
    const loaded = await loadCatalogue({ kv, source }, pick("fr"));
    expect(loaded.locale).toBe("fr");
    expect(loaded.version).toBe(INITIAL_I18N_VERSION);
    expect(loaded.overlay).toEqual({
      fr: { "common.cancel": "Laisser tomber" },
    });
    const i18n = createI18n(loaded.locale, loaded.overlay);
    expect(i18n.t("common.cancel")).toBe("Laisser tomber");
    expect(i18n.t("common.confirm")).toBe("Confirmer");
  });

  test("a language the data adds is accepted; a disabled or unknown one is not", async () => {
    const { source } = fakeSource();
    expect((await loadCatalogue({ kv, source }, pick("de"))).locale).toBe("de");
    expect((await loadCatalogue({ kv, source }, pick("en"))).locale).toBe("nl");
    expect((await loadCatalogue({ kv, source }, pick("xx"))).locale).toBe("nl");
  });

  test("an overlay edit appears after the version is bumped, without a deploy", async () => {
    const { calls, source, strings } = fakeSource();
    const first = await loadCatalogue({ kv, source }, pick("fr"));
    expect(createI18n("fr", first.overlay).t("common.cancel")).toBe(
      "Laisser tomber"
    );
    // The same version: served from the isolate's cache, no D1 read.
    const readsBefore = calls.strings;
    await loadCatalogue({ kv, source }, pick("fr"));
    expect(calls.strings).toBe(readsBefore);

    // An edit in D1 without a bump stays invisible (documented)...
    strings.fr = { "common.cancel": "Stop" };
    const stale = await loadCatalogue({ kv, source }, pick("fr"));
    expect(createI18n("fr", stale.overlay).t("common.cancel")).toBe(
      "Laisser tomber"
    );
    // ...and the bump makes it appear.
    const version = await bumpI18nVersion(kv);
    expect(kv.data.get(I18N_VERSION_KEY)).toBe(version);
    const fresh = await loadCatalogue({ kv, source }, pick("fr"));
    expect(fresh.version).toBe(version);
    expect(createI18n("fr", fresh.overlay).t("common.cancel")).toBe("Stop");
  });

  test("reads the languages once per version and each language's rows once", async () => {
    const { calls, source } = fakeSource();
    await loadCatalogue({ kv, source }, pick("fr"));
    await loadCatalogue({ kv, source }, pick("fr"));
    await loadCatalogue({ kv, source }, pick("de"));
    expect(calls.languages).toBe(1);
    // nl (the default), fr and de.
    expect(calls.strings).toBe(3);
    // The isolate's memo: one KV read for the three requests.
    expect(kv.gets).toBe(1);
  });

  test("another isolate's bump is seen once the memo (30 s) has expired", async () => {
    const { source, strings } = fakeSource();
    let clock = 1_000_000;
    const now = () => clock;
    await loadCatalogue({ kv, now, source }, pick("fr"));
    strings.fr = { "common.cancel": "Stop" };
    kv.data.set(I18N_VERSION_KEY, "written-by-another-isolate");
    clock += 29_000;
    const within = await loadCatalogue({ kv, now, source }, pick("fr"));
    expect(within.overlay.fr).toEqual({ "common.cancel": "Laisser tomber" });
    clock += 2000;
    const after = await loadCatalogue({ kv, now, source }, pick("fr"));
    expect(after.version).toBe("written-by-another-isolate");
    expect(after.overlay.fr).toEqual({ "common.cancel": "Stop" });
  });

  test("loadLanguages lists the enabled languages and falls back to the shipped ones", async () => {
    const { source } = fakeSource();
    const languages = await loadLanguages({ kv, source });
    expect(languages.map((language) => language.code)).toEqual([
      "nl",
      "fr",
      "de",
    ]);
    resetCatalogueCache();
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const broken: CatalogueSource = {
      languages: () => Promise.reject(new Error("D1 is down")),
      strings: () => Promise.reject(new Error("D1 is down")),
    };
    expect(await loadLanguages({ kv, source: broken })).toEqual(
      SHIPPED_LANGUAGES
    );
    error.mockRestore();
  });

  test("hands over only the active and the default language", async () => {
    const { source, strings } = fakeSource();
    strings.nl = { "common.cancel": "Stop" };
    strings.de = { "common.cancel": "Abbrechen" };
    const loaded = await loadCatalogue({ kv, source }, pick("fr"));
    expect(Object.keys(loaded.overlay).sort()).toEqual(["fr", "nl"]);
  });

  test("a failing source falls back to the shipped base and logs", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const source: CatalogueSource = {
      languages: () => Promise.reject(new Error("D1 is down")),
      strings: () => Promise.reject(new Error("D1 is down")),
    };
    const loaded = await loadCatalogue({ kv, source }, pick("fr"));
    expect(loaded.languages).toEqual(SHIPPED_LANGUAGES);
    expect(loaded.locale).toBe("fr");
    expect(loaded.overlay).toEqual({});
    expect(createI18n(loaded.locale, loaded.overlay).t("common.cancel")).toBe(
      "Annuler"
    );
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  test("a failing KV falls back the same way", async () => {
    const error = spyOn(console, "error").mockImplementation(() => undefined);
    const broken: CatalogueKv = {
      get: () => Promise.reject(new Error("KV is down")),
      put: () => Promise.reject(new Error("KV is down")),
    };
    const { source } = fakeSource();
    const loaded = await loadCatalogue({ kv: broken, source }, pick("en"));
    expect(loaded.locale).toBe("en");
    expect(loaded.overlay).toEqual({});
    error.mockRestore();
  });
});

describe("loadLegalText", () => {
  const document = {
    sections: [{ blocks: ["Text"], id: "scope", title: "Scope" }],
    title: "Terms",
  };

  function legalSource(rows: Record<string, unknown>) {
    const calls = { published: 0 };
    const source: LegalSource = {
      published: (kind, locale) => {
        calls.published += 1;
        const row = rows[`${kind}:${locale}`];
        return Promise.resolve(
          row === undefined
            ? null
            : { content: row, effectiveDate: "2026-11-01", version: 2 }
        );
      },
    };
    return { calls, source };
  }

  test("returns the published row, validated, once per version", async () => {
    const { calls, source } = legalSource({ "terms:nl": document });
    const first = await loadLegalText({ kv, source }, "terms", "nl");
    expect(first).toEqual({
      document,
      effectiveDate: "2026-11-01",
      version: 2,
    });
    await loadLegalText({ kv, source }, "terms", "nl");
    expect(calls.published).toBe(1);
  });

  test("a bump of the i18n version reads the row again", async () => {
    const { calls, source } = legalSource({ "terms:nl": document });
    await loadLegalText({ kv, source }, "terms", "nl");
    await bumpI18nVersion(kv);
    await loadLegalText({ kv, source }, "terms", "nl");
    expect(calls.published).toBe(2);
  });

  test("no row, a row that does not validate or a failing source gives null (the shipped text shows)", async () => {
    const { source } = legalSource({ "terms:fr": { title: "x" } });
    expect(await loadLegalText({ kv, source }, "terms", "nl")).toBeNull();
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadLegalText({ kv, source }, "terms", "fr")).toBeNull();
    const failing: LegalSource = {
      published: () => Promise.reject(new Error("d1 down")),
    };
    expect(
      await loadLegalText({ kv, source: failing }, "terms", "en")
    ).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
