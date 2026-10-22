import { env, exports } from "cloudflare:workers";
import { createI18n } from "@smog/i18n";
import { bumpI18nVersion } from "@smog/i18n/server";
import { afterEach, describe, expect, it } from "vitest";
import { siteEnv } from "../src/server/auth";
import { catalogueDeps, emailOverlay } from "../src/server/catalogue";
import { createRpcContext } from "../src/server/context";
import { ORIGIN } from "./helpers";

/*
 * The runtime catalogue (phase 10b task 3, ruling 1): the shipped catalogues
 * are the base and the D1 `ui_string` rows are an overlay behind the KV
 * version `i18n:version`. Languages are data (`language`). An edit shows
 * without a deploy once the version is bumped, which every translation write
 * does.
 */

interface Catalogue {
  languages: {
    code: string;
    intlTag: string;
    isDefault: boolean;
    name: string;
  }[];
  locale: string;
  overlay: Record<string, Record<string, string>>;
  version: string;
}

async function catalogue(locale: string | null): Promise<Catalogue> {
  const response = await exports.default.fetch(
    `${ORIGIN}/api/rpc/system/i18n`,
    {
      body: JSON.stringify({ json: { locale } }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { json: Catalogue }).json;
}

async function putString(
  locale: string,
  key: string,
  value: string
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO ui_string (locale, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (locale, key) DO UPDATE SET value = excluded.value"
  )
    .bind(locale, key, value, Date.now())
    .run();
}

async function publishEdit(): Promise<void> {
  // What every translation write does after its D1 batch.
  await bumpI18nVersion(env.KV);
}

async function page(path: string, cookie: string): Promise<string> {
  const response = await exports.default.fetch(`${ORIGIN}${path}`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return await response.text();
}

afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ui_string WHERE locale IN ('fr', 'nl', 'de')"),
    env.DB.prepare("DELETE FROM language WHERE code = 'de'"),
  ]);
  await publishEdit();
});

describe("the overlay behind the i18n version", () => {
  it("serves the enabled languages and an empty overlay by default", async () => {
    const loaded = await catalogue("fr");
    expect(loaded.locale).toBe("fr");
    expect(loaded.languages.map((language) => language.code)).toEqual([
      "nl",
      "en",
      "fr",
    ]);
    expect(loaded.languages.find((language) => language.isDefault)?.code).toBe(
      "nl"
    );
    expect(loaded.overlay).toEqual({});
  });

  it("shows an overlay edit without a deploy, over the shipped base", async () => {
    const before = await catalogue("fr");
    expect(createI18n(before.locale, before.overlay).t("common.cancel")).toBe(
      "Annuler"
    );

    await putString("fr", "common.cancel", "Laisser tomber");
    await publishEdit();

    const after = await catalogue("fr");
    expect(after.overlay).toEqual({
      fr: { "common.cancel": "Laisser tomber" },
    });
    const i18n = createI18n(after.locale, after.overlay);
    expect(i18n.t("common.cancel")).toBe("Laisser tomber");
    // Everything else is still the shipped text.
    expect(i18n.t("common.confirm")).toBe("Confirmer");
  });

  it("never renders an empty or missing value: blank rows and unknown languages fall back", async () => {
    await putString("fr", "common.cancel", "   ");
    await publishEdit();
    const loaded = await catalogue("fr");
    const i18n = createI18n(loaded.locale, loaded.overlay);
    expect(i18n.t("common.cancel")).toBe("Annuler");
    // A language that is not in the table resolves to the default language.
    const unknown = await catalogue("xx");
    expect(unknown.locale).toBe("nl");
    expect(createI18n(unknown.locale, unknown.overlay).t("common.cancel")).toBe(
      "Annuleren"
    );
  });

  it("a language added as data works at once: untranslated keys show the default language", async () => {
    await env.DB.prepare(
      "INSERT INTO language (code, name, intl_tag, enabled, is_default, sort_order) VALUES ('de', 'Deutsch', 'de-BE', 1, 0, 9)"
    ).run();
    await putString("de", "common.cancel", "Abbrechen");
    await publishEdit();

    const loaded = await catalogue("de");
    expect(loaded.locale).toBe("de");
    expect(loaded.languages.map((language) => language.code)).toContain("de");
    const i18n = createI18n(loaded.locale, loaded.overlay);
    expect(i18n.t("common.cancel")).toBe("Abbrechen");
    expect(i18n.t("common.confirm")).toBe("Bevestigen");

    // Disabled, it is no longer offered and resolves to the default.
    await env.DB.prepare(
      "UPDATE language SET enabled = 0 WHERE code = 'de'"
    ).run();
    await publishEdit();
    const disabled = await catalogue("de");
    expect(disabled.locale).toBe("nl");
    expect(disabled.languages.map((language) => language.code)).not.toContain(
      "de"
    );
  });

  it("the RPC context only accepts enabled languages from the cookie", async () => {
    await env.DB.prepare(
      "INSERT INTO language (code, name, intl_tag, enabled, is_default, sort_order) VALUES ('de', 'Deutsch', 'de-BE', 1, 0, 9)"
    ).run();
    await publishEdit();
    const { loadLanguages } = await import("@smog/i18n/server");
    const codes = (await loadLanguages(catalogueDeps())).map(
      (language) => language.code
    );
    const request = new Request(ORIGIN, { headers: { cookie: "locale=de" } });
    const ctx = { waitUntil: () => undefined };
    expect(createRpcContext(request, siteEnv(), ctx, codes).locale).toBe("de");
    // Without the data, the shipped three only.
    expect(createRpcContext(request, siteEnv(), ctx).locale).toBe("nl");
  });
});

describe("the pages and emails read the merged catalogue", () => {
  it("the root loader hands the overlay to the browser, only the rows", async () => {
    await putString("fr", "common.appName", "SMOG Édité");
    await publishEdit();
    const html = await page("/", "locale=fr");
    expect(html).toContain("SMOG Édité");
    // The shipped base is not sent as data: the overlay holds the edited row only.
    expect(html).not.toContain('"common.cancel":"Annuler"');
  });

  it("the language menu data lists the enabled languages with their own names", async () => {
    const html = await page("/", "locale=nl");
    for (const name of ["Nederlands", "English", "Français"]) {
      expect(html).toContain(name);
    }
  });

  it("emails render through the overlay of the recipient's language", async () => {
    await putString("fr", "common.appName", "SMOG Édité");
    await publishEdit();
    const overlay = await emailOverlay("fr");
    expect(overlay).toEqual({ fr: { "common.appName": "SMOG Édité" } });
    // A language that is not enabled any more reads the default language's rows.
    const fallback = await emailOverlay("xx");
    expect(Object.keys(fallback)).not.toContain("xx");
  });
});
