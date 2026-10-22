import { env } from "cloudflare:workers";
import { uiCatalogueSource } from "@smog/db";
import { loadLanguages } from "@smog/i18n/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { LanguageRow } from "../src/schema";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  i18nVersion,
  resetTranslationData,
  signedUp,
  testDb,
} from "./helpers";

let admin: Authed;
let translator: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
  translator = await signedUp("translator");
});

beforeEach(async () => {
  await resetTranslationData();
  await env.KV.delete("i18n:version");
});

async function languages(): Promise<LanguageRow[]> {
  return (await callAs<{ items: LanguageRow[] }>(translator, "languages.list"))
    .items;
}

describe("the language list", () => {
  it("shows the seeded languages in order, the default flagged, to a translator", async () => {
    const items = await languages();
    expect(items.map((row) => row.code)).toEqual(["nl", "en", "fr"]);
    expect(items.find((row) => row.isDefault)?.code).toBe("nl");
    expect(items.every((row) => row.enabled)).toBe(true);
  });
});

describe("adding a language", () => {
  it("creates it after the last one, audited, and the menu loads it at once", async () => {
    const mark = await auditMark();
    const before = await i18nVersion();
    const created = await callAs<LanguageRow>(admin, "languages.create", {
      code: "pt-BR",
      intlTag: "pt-BR",
      name: "Português (Brasil)",
    });
    expect(created).toMatchObject({
      code: "pt-BR",
      enabled: true,
      isDefault: false,
      name: "Português (Brasil)",
      sortOrder: 3,
    });
    expect(await i18nVersion()).not.toBe(before);
    const [audit] = await auditRowsSince(mark);
    expect(audit).toMatchObject({
      action: "language.create",
      actorId: admin.user.id,
      targetId: "pt-BR",
      targetType: "language",
    });
    const menu = await loadLanguages({
      kv: env.KV,
      source: uiCatalogueSource(testDb()),
    });
    expect(menu.map((row) => row.code)).toContain("pt-BR");
  });

  it("refuses a taken code, a code that is not canonical and an invalid Intl tag", async () => {
    const taken = await failureOf(
      callAs(admin, "languages.create", {
        code: "fr",
        intlTag: "fr-FR",
        name: "Francais",
      })
    );
    expect(taken).toMatchObject({
      code: "CONFLICT",
      data: { reason: "exists" },
    });
    const lower = await failureOf(
      callAs(admin, "languages.create", {
        code: "pt-br",
        intlTag: "pt-BR",
        name: "Portugues",
      })
    );
    expect(lower).toMatchObject({
      code: "VALIDATION",
      data: { fieldErrors: { code: ["invalid"] } },
    });
    const tag = await failureOf(
      callAs(admin, "languages.create", {
        code: "de",
        intlTag: "not a tag",
        name: "Deutsch",
      })
    );
    expect(tag).toMatchObject({
      data: { fieldErrors: { intlTag: ["invalid"] } },
    });
    expect(await languages()).toHaveLength(3);
  });
});

describe("changing a language", () => {
  it("renames, reorders and disables one, audited with the changed fields", async () => {
    const mark = await auditMark();
    const updated = await callAs<LanguageRow>(admin, "languages.update", {
      code: "en",
      enabled: false,
      name: "English (UK)",
      sortOrder: 9,
    });
    expect(updated).toMatchObject({
      enabled: false,
      name: "English (UK)",
      sortOrder: 9,
    });
    const [audit] = await auditRowsSince(mark);
    expect(audit).toMatchObject({
      action: "language.update",
      targetId: "en",
      targetType: "language",
    });
    const data = audit?.data as { fields: string[] };
    const { fields } = data;
    expect([...fields].sort()).toEqual(["enabled", "name", "sortOrder"]);
    // A disabled language leaves the menu and the strings table.
    const menu = await loadLanguages({
      kv: env.KV,
      source: uiCatalogueSource(testDb()),
    });
    expect(menu.map((row) => row.code)).not.toContain("en");
    const table = await callAs<{ languages: string[] }>(
      translator,
      "strings.list",
      { limit: 1 }
    );
    expect(table.languages).toEqual(["nl", "fr"]);
  });

  it("never disables the default language", async () => {
    const refused = await failureOf(
      callAs(admin, "languages.update", { code: "nl", enabled: false })
    );
    expect(refused).toMatchObject({
      code: "INVALID_STATE",
      data: { reason: "defaultLanguage" },
    });
  });

  it("writes nothing for what is already stored, and refuses an empty patch and an unknown code", async () => {
    const mark = await auditMark();
    const same = await callAs<LanguageRow>(admin, "languages.update", {
      code: "fr",
      name: "Français",
    });
    expect(same.name).toBe("Français");
    expect(await auditRowsSince(mark)).toHaveLength(0);
    const empty = await failureOf(
      callAs(admin, "languages.update", { code: "fr" })
    );
    expect(empty.code).toBe("VALIDATION");
    const unknown = await failureOf(
      callAs(admin, "languages.update", { code: "xx", name: "Nope" })
    );
    expect(unknown.code).toBe("NOT_FOUND");
  });
});
