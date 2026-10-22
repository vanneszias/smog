import { env } from "cloudflare:workers";
import { uiCatalogueSource } from "@smog/db";
import { loadCatalogue } from "@smog/i18n/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ImportPlan,
  StringSaveResult,
  StringsImportResult,
  StringsPage,
} from "../src/schema";
import {
  type Authed,
  addLanguage,
  auditMark,
  auditRowsSince,
  callAs,
  failureOf,
  i18nVersion,
  resetTranslationData,
  signedUp,
  testDb,
} from "./helpers";

const KEY = "auth.errors.generic";
const PLACEHOLDER_KEY = "kit.stepOf";

let admin: Authed;
let translator: Authed;
let learner: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
  translator = await signedUp("translator");
  learner = await signedUp("user");
});

beforeEach(async () => {
  await resetTranslationData();
  await env.KV.delete("i18n:version");
});

async function list(input: Record<string, unknown> = {}): Promise<StringsPage> {
  return await callAs<StringsPage>(translator, "strings.list", input);
}

async function save(
  input: Record<string, unknown>,
  as: Authed = translator
): Promise<StringSaveResult> {
  return await callAs<StringSaveResult>(as, "strings.save", input);
}

describe("who may call", () => {
  it("lets a guest and a learner nowhere and a translator in", async () => {
    expect((await failureOf(callAs(null, "strings.list", {}))).code).toBe(
      "UNAUTHORIZED"
    );
    expect((await failureOf(callAs(learner, "strings.list", {}))).code).toBe(
      "FORBIDDEN"
    );
    expect((await list()).total).toBeGreaterThan(1700);
    // An admin passes the translator guard.
    expect(
      (await callAs<StringsPage>(admin, "strings.list", { limit: 1 })).items
    ).toHaveLength(1);
  });

  it("keeps the language screen to the admin", async () => {
    const created = await failureOf(
      callAs(translator, "languages.create", {
        code: "de",
        intlTag: "de-BE",
        name: "Deutsch",
      })
    );
    expect(created.code).toBe("FORBIDDEN");
    const updated = await failureOf(
      callAs(translator, "languages.update", { code: "en", name: "English" })
    );
    expect(updated.code).toBe("FORBIDDEN");
  });
});

describe("the table", () => {
  it("lists the catalogue with a cell per enabled language", async () => {
    const page = await list({ limit: 5 });
    expect(page.languages).toEqual(["nl", "en", "fr"]);
    expect(page.items).toHaveLength(5);
    expect(page.namespaces).toContain("auth");
    const [first] = page.items;
    expect(Object.keys(first?.cells ?? {})).toEqual(["nl", "en", "fr"]);
  });

  it("pages and filters by namespace and search", async () => {
    const all = await list({ limit: 200 });
    const second = await list({ limit: 200, offset: 200 });
    expect(second.items[0]?.key).not.toBe(all.items[0]?.key);
    const auth = await list({ limit: 200, namespace: "auth" });
    expect(auth.total).toBeLessThan(all.total);
    expect(auth.items.every((row) => row.namespace === "auth")).toBe(true);
    const found = await list({ search: "AUTH.ERRORS.GENERIC" });
    expect(found.items.map((row) => row.key)).toContain(KEY);
  });

  it("finds a text ignoring case and accents", async () => {
    const found = await list({ limit: 200, search: "francais" });
    // The French name of the language contains a cedilla.
    expect(found.total).toBeGreaterThan(0);
  });

  it("shows a language added as data as missing everywhere and filters on it", async () => {
    await addLanguage(admin, "de", "Deutsch", "de-BE");
    const page = await list({ limit: 1, locale: "de", status: "missing" });
    expect(page.languages).toEqual(["nl", "en", "fr", "de"]);
    expect(page.total).toBeGreaterThan(1700);
    const none = await list({ locale: "fr", status: "missing" });
    expect(none.total).toBe(0);
    const coverage = await callAs<{
      languages: { code: string; missing: number; translated: number }[];
    }>(translator, "coverage");
    const de = coverage.languages.find((row) => row.code === "de");
    expect(de?.translated).toBe(0);
    expect(de?.missing).toBeGreaterThan(1700);
  });
});

describe("saving", () => {
  it("writes the text, audits it, bumps the version and shows without a deploy", async () => {
    const before = await i18nVersion();
    const mark = await auditMark();
    const row = (await list({ search: KEY })).items.find((r) => r.key === KEY);
    expect(row?.cells.en?.overridden).toBe(false);
    const saved = await save({
      expectedUpdatedAt: null,
      key: KEY,
      locale: "en",
      value: "Something broke, sorry",
    });
    expect(saved.cell).toMatchObject({
      overridden: true,
      stale: false,
      value: "Something broke, sorry",
    });
    expect(await i18nVersion()).not.toBe(before);
    const audits = await auditRowsSince(mark);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "translation.string_save",
      actorId: translator.user.id,
      data: { key: KEY, locale: "en" },
      targetId: `en:${KEY}`,
      targetType: "ui_string",
    });
    // The runtime catalogue serves it at once (the same loader the site uses).
    const catalogue = await loadCatalogue(
      { kv: env.KV, source: uiCatalogueSource(testDb()) },
      () => "en"
    );
    expect(catalogue.overlay).toMatchObject({
      en: { [KEY]: "Something broke, sorry" },
    });
  });

  it("stores the hash of the source and marks the text stale when the source is edited", async () => {
    await save({
      expectedUpdatedAt: null,
      key: KEY,
      locale: "en",
      value: "An English text",
    });
    const fresh = (await list({ search: KEY })).items.find(
      (r) => r.key === KEY
    );
    expect(fresh?.cells.en?.stale).toBe(false);
    // An editor changes the Dutch source: the English text is stale until confirmed.
    await save({
      expectedUpdatedAt: fresh?.cells.nl?.updatedAt ?? null,
      key: KEY,
      locale: "nl",
      value: "Er ging iets mis, sorry",
    });
    const after = (await list({ search: KEY })).items.find(
      (r) => r.key === KEY
    );
    expect(after?.cells.en?.stale).toBe(true);
    expect(after?.source).toBe("Er ging iets mis, sorry");
    const stale = await list({ locale: "en", status: "stale" });
    expect(stale.items.map((r) => r.key)).toEqual([KEY]);
    // Saving the same text confirms it.
    await save({
      expectedUpdatedAt: after?.cells.en?.updatedAt ?? null,
      key: KEY,
      locale: "en",
      value: "An English text",
    });
    expect((await list({ locale: "en", status: "stale" })).total).toBe(0);
  });

  it("refuses an empty text, a placeholder mismatch and one that is too long", async () => {
    const empty = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: KEY,
        locale: "en",
        value: "   ",
      })
    );
    expect(empty).toMatchObject({
      code: "VALIDATION",
      data: { fieldErrors: { value: ["empty"] } },
    });
    const placeholders = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: PLACEHOLDER_KEY,
        locale: "en",
        value: "Step",
      })
    );
    expect(placeholders).toMatchObject({
      data: { fieldErrors: { value: ["placeholders"] } },
    });
    const long = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: KEY,
        locale: "en",
        value: "x".repeat(4001),
      })
    );
    expect(long).toMatchObject({
      data: { fieldErrors: { value: ["tooLong"] } },
    });
    expect((await list({ locale: "en", status: "invalid" })).total).toBe(0);
  });

  it("answers CONFLICT with the stored text when somebody saved first", async () => {
    const first = await save({
      expectedUpdatedAt: null,
      key: KEY,
      locale: "fr",
      value: "Premier",
    });
    const lost = await failureOf(
      callAs(admin, "strings.save", {
        expectedUpdatedAt: null,
        key: KEY,
        locale: "fr",
        value: "Second",
      })
    );
    expect(lost.code).toBe("CONFLICT");
    expect(lost.data).toMatchObject({
      current: { value: "Premier" },
      reason: "stale",
    });
    // With the token of what they saw, the second editor wins.
    const won = await callAs<StringSaveResult>(admin, "strings.save", {
      expectedUpdatedAt: first.cell.updatedAt,
      key: KEY,
      locale: "fr",
      value: "Second",
    });
    expect(won.cell.value).toBe("Second");
  });

  it("writes nothing and audits nothing when the text is the stored one", async () => {
    const mark = await auditMark();
    const before = await i18nVersion();
    const row = (await list({ search: KEY })).items.find((r) => r.key === KEY);
    const shipped = row?.cells.fr?.value ?? "";
    await save({
      expectedUpdatedAt: null,
      key: KEY,
      locale: "fr",
      value: shipped,
    });
    expect(await auditRowsSince(mark)).toHaveLength(0);
    expect(await i18nVersion()).toBe(before);
  });

  it("reverts an override to the shipped text, audited", async () => {
    const saved = await save({
      expectedUpdatedAt: null,
      key: KEY,
      locale: "en",
      value: "Custom",
    });
    const mark = await auditMark();
    const reverted = await save({
      expectedUpdatedAt: saved.cell.updatedAt,
      key: KEY,
      locale: "en",
      value: null,
    });
    expect(reverted.cell.overridden).toBe(false);
    expect(reverted.cell.value).not.toBe("Custom");
    const audits = await auditRowsSince(mark);
    expect(audits[0]).toMatchObject({
      action: "translation.string_save",
      data: { key: KEY, locale: "en", reverted: true },
    });
  });

  it("answers NOT_FOUND for an unknown key, a disabled language and a plural form not in use", async () => {
    const unknownKey = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: "no.such.key",
        locale: "en",
        value: "x",
      })
    );
    expect(unknownKey.code).toBe("NOT_FOUND");
    const unknownLocale = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: KEY,
        locale: "de",
        value: "x",
      })
    );
    expect(unknownLocale.code).toBe("NOT_FOUND");
    const page = await list({ limit: 200, search: "_many" });
    const many = page.items.find((row) => row.key.endsWith("_many"));
    expect(many?.cells.nl?.applicable).toBe(false);
    const unused = await failureOf(
      callAs(translator, "strings.save", {
        expectedUpdatedAt: null,
        key: many?.key,
        locale: "nl",
        value: "x",
      })
    );
    expect(unused.code).toBe("NOT_FOUND");
  });
});

describe("import and export", () => {
  it.each(["json", "csv"] as const)(
    "exports a language as %s and imports it back with nothing to change",
    async (format) => {
      const file = await callAs<{ content: string; rows: number }>(
        translator,
        "strings.export",
        { format, locale: "fr" }
      );
      expect(file.rows).toBeGreaterThan(1700);
      const plan = await callAs<ImportPlan>(translator, "strings.preview", {
        content: file.content,
        format,
        locale: "fr",
      });
      expect(plan.problemCount).toBe(0);
      expect(plan.added + plan.changed).toBe(0);
    }
  );

  it("previews without writing and applies once, audited with the row count", async () => {
    await addLanguage(admin, "de", "Deutsch", "de-BE");
    const content = JSON.stringify({
      [KEY]: "Etwas ging schief",
      "no.such.key": "x",
      [PLACEHOLDER_KEY]: "Schritt {{current}} von {{total}}",
    });
    const mark = await auditMark();
    const before = await i18nVersion();
    const plan = await callAs<ImportPlan>(translator, "strings.preview", {
      content,
      format: "json",
      locale: "de",
    });
    expect(plan).toMatchObject({ added: 2, changed: 0, problemCount: 1 });
    expect(plan.changes.map((c) => c.key).sort()).toEqual(
      [KEY, PLACEHOLDER_KEY].sort()
    );
    // The dry run wrote nothing.
    expect(await auditRowsSince(mark)).toHaveLength(0);
    expect(await i18nVersion()).toBe(before);
    expect(
      (await list({ locale: "de", status: "missing" })).total
    ).toBeGreaterThan(1700);

    const applied = await callAs<StringsImportResult>(
      translator,
      "strings.import",
      { content, format: "json", locale: "de" }
    );
    expect(applied).toEqual({ applied: 2, skipped: 1 });
    const audits = await auditRowsSince(mark);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "translation.string_import",
      actorId: translator.user.id,
      data: { applied: 2, format: "json", skipped: 1 },
      targetId: "de",
      targetType: "ui_string",
    });
    expect(await i18nVersion()).not.toBe(before);
    const row = (await list({ limit: 200, search: KEY })).items.find(
      (r) => r.key === KEY
    );
    expect(row?.cells.de).toMatchObject({
      missing: false,
      overridden: true,
      value: "Etwas ging schief",
    });
    // A second apply finds nothing to change and writes no audit row.
    const again = await callAs<StringsImportResult>(
      translator,
      "strings.import",
      {
        content,
        format: "json",
        locale: "de",
      }
    );
    expect(again.applied).toBe(0);
    expect(await auditRowsSince(mark)).toHaveLength(1);
  });

  it("imports a CSV with several languages, counts them as a file with no single target", async () => {
    const content = `key,en,fr\r\n${KEY},English one,Francais un\r\n`;
    const mark = await auditMark();
    const result = await callAs<StringsImportResult>(
      translator,
      "strings.import",
      {
        content,
        format: "csv",
      }
    );
    expect(result.applied).toBe(2);
    const [audit] = await auditRowsSince(mark);
    expect(audit).toMatchObject({ targetId: null, targetType: "ui_string" });
  });

  it("refuses a file it cannot read, and one over the size cap", async () => {
    const bad = await failureOf(
      callAs(translator, "strings.preview", {
        content: "{nope",
        format: "json",
        locale: "en",
      })
    );
    expect(bad).toMatchObject({
      code: "VALIDATION",
      data: { fieldErrors: { content: ["invalidJson"] } },
    });
    const big = await failureOf(
      callAs(translator, "strings.import", {
        content: "x".repeat(2_000_001),
        format: "json",
        locale: "en",
      })
    );
    // Input validation, before the handler (the HTTP layer maps it to VALIDATION).
    expect(big.code).toBe("BAD_REQUEST");
  });

  it("is closed to a learner", async () => {
    const failure = await failureOf(
      callAs(learner, "strings.import", {
        content: "{}",
        format: "json",
        locale: "en",
      })
    );
    expect(failure.code).toBe("FORBIDDEN");
  });
});
