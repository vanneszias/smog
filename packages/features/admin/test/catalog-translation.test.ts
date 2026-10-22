import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import {
  categoryTranslation,
  gestureKeyword,
  gestureTranslation,
  language,
  userRole,
} from "@smog/db";
import { eq, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { searchGestures } from "../../gestures/src/server/search";
import { createCatalogTranslationRouter } from "../src/server";
import { addCategory, addGesture, catalogVersion } from "./catalog-helpers";
import { adminDeps } from "./deps";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  signedUp,
  testDb,
} from "./helpers";

/*
 * `catalogTranslation.*` over the test D1: who may call it, what a save
 * writes (the translation, this language's keywords only, the full-text rows,
 * the audit entry, a new catalog version), the stale lock, the no-op, the
 * needs-translation list and the counts.
 */

const router = createCatalogTranslationRouter(adminDeps);

type Procedure = Parameters<typeof call>[0];

function procedureAt(path: string): Procedure {
  let node: unknown = router;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  return node as Procedure;
}

async function callTranslation<T = unknown>(
  as: Authed | null,
  path: string,
  input?: unknown
): Promise<T> {
  return (await call(procedureAt(path), input, {
    context: await contextAs(as),
    path: ["catalogTranslation", ...path.split(".")],
  })) as T;
}

async function failure(
  run: Promise<unknown>
): Promise<{ code: string; data?: unknown }> {
  try {
    await run;
  } catch (error) {
    return error as { code: string; data?: unknown };
  }
  throw new Error("[test] expected the call to fail");
}

async function withRole(role: "teacher" | "translator"): Promise<Authed> {
  const account = await signedUp("user");
  await testDb().insert(userRole).values({ role, userId: account.user.id });
  return account;
}

let admin: Authed;
let translator: Authed;
let teacher: Authed;
let plain: Authed;

beforeEach(async () => {
  // The tests of a file share storage: start from an empty catalogue.
  await env.DB.batch(
    [
      "DELETE FROM gesture",
      "DELETE FROM category",
      "DELETE FROM gesture_fts",
    ].map((statement) => env.DB.prepare(statement))
  );
});

beforeAll(async () => {
  admin = await signedUp("admin");
  translator = await withRole("translator");
  teacher = await withRole("teacher");
  plain = await signedUp("user");
});

interface Saved {
  updatedAt: number;
}

async function save(
  as: Authed,
  input: {
    description?: string;
    expectedUpdatedAt: number | null;
    id: string;
    keywords?: string[];
    locale?: string;
    name: string;
  }
): Promise<Saved> {
  return await callTranslation<Saved>(as, "gestures.save", {
    locale: "fr",
    ...input,
  });
}

interface LocaleFtsRow {
  categories: string;
  keywords: string;
  locale: string;
  name: string;
}

/** The gesture's full-text rows, one per language. */
async function ftsRows(id: string): Promise<LocaleFtsRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT name, keywords, categories, locale FROM gesture_fts WHERE gesture_id = ? ORDER BY locale"
  )
    .bind(id)
    .all<LocaleFtsRow>();
  return results;
}

/** A gesture's keywords: the language's, or (without one) every language's, `nl` first. */
async function keywordsOf(id: string, locale?: string): Promise<string[]> {
  const rows = await testDb()
    .select({ keyword: gestureKeyword.keyword, locale: gestureKeyword.locale })
    .from(gestureKeyword)
    .where(eq(gestureKeyword.gestureId, id))
    .orderBy(
      sql`${gestureKeyword.locale} = 'nl' DESC`,
      gestureKeyword.locale,
      gestureKeyword.position
    );
  return rows
    .filter((row) => locale === undefined || row.locale === locale)
    .map((row) => row.keyword);
}

describe("who may call it", () => {
  const calls: [string, unknown][] = [
    ["gestures.list", { locale: "fr" }],
    ["reports", undefined],
    ["categories.list", { locale: "fr" }],
  ];

  for (const [path, input] of calls) {
    it(`${path}: guests UNAUTHORIZED, users and teachers FORBIDDEN, a translator and an admin pass`, async () => {
      expect((await failure(callTranslation(null, path, input))).code).toBe(
        "UNAUTHORIZED"
      );
      expect((await failure(callTranslation(plain, path, input))).code).toBe(
        "FORBIDDEN"
      );
      expect((await failure(callTranslation(teacher, path, input))).code).toBe(
        "FORBIDDEN"
      );
      await callTranslation(translator, path, input);
      await callTranslation(admin, path, input);
    });
  }

  it("the admin procedures stay admin only for a translator", async () => {
    expect((await failure(callAs(translator, "gestures.list", {}))).code).toBe(
      "FORBIDDEN"
    );
  });
});

describe("catalogTranslation.gestures.save", () => {
  it("writes the translation, this language's keywords, the full-text rows and the audit entry, then bumps the catalog version", async () => {
    const dieren = await addCategory("Dieren");
    const hond = await addGesture({
      categories: [dieren],
      keywords: ["hondje", "huisdier"],
      name: "Hond",
    });
    const mark = await auditMark();
    const version = await catalogVersion();

    const saved = await save(translator, {
      description: "Un chien fidèle.",
      expectedUpdatedAt: null,
      id: hond.id,
      keywords: ["toutou", "animal de compagnie"],
      name: "Chien",
    });

    const [stored] = await testDb()
      .select()
      .from(gestureTranslation)
      .where(eq(gestureTranslation.gestureId, hond.id));
    expect(stored).toMatchObject({
      description: "Un chien fidèle.",
      locale: "fr",
      name: "Chien",
      updatedBy: translator.user.id,
    });
    expect(stored?.updatedAt.getTime()).toBe(saved.updatedAt);
    // The Dutch keywords are untouched, the French ones are added.
    expect(await keywordsOf(hond.id)).toEqual([
      "hondje",
      "huisdier",
      "toutou",
      "animal de compagnie",
    ]);
    const rows = await ftsRows(hond.id);
    expect(rows.map((row) => row.locale).sort()).toEqual(["fr", "nl"]);
    expect(await catalogVersion()).not.toBe(version);
    const found = await searchGestures(
      { db: testDb(), kv: env.KV, locale: "fr" },
      { limit: 10, q: "toutou" }
    );
    expect(found.items.map((item) => item.name)).toEqual(["Chien"]);

    const entries = await auditRowsSince(mark);
    expect(entries).toEqual([
      {
        action: "translation.gesture_save",
        actorId: translator.user.id,
        data: {
          created: true,
          fields: ["name", "description", "keywords"],
          locale: "fr",
          name: "Hond",
          slug: hond.slug,
        },
        targetId: hond.id,
        targetType: "gesture",
      },
    ]);
  });

  it("replaces only the language's keywords, and a later Dutch edit keeps them", async () => {
    const hond = await addGesture({ keywords: ["hondje"], name: "Hond" });
    const first = await save(admin, {
      expectedUpdatedAt: null,
      id: hond.id,
      keywords: ["toutou"],
      name: "Chien",
    });
    await save(admin, {
      expectedUpdatedAt: first.updatedAt,
      id: hond.id,
      keywords: ["clebs", "chienchien"],
      name: "Chien",
    });
    expect(await keywordsOf(hond.id)).toEqual([
      "hondje",
      "clebs",
      "chienchien",
    ]);

    // The admin editor replaces the Dutch keywords and nothing else.
    const detail = await callAs<{ updatedAt: number }>(admin, "gestures.get", {
      id: hond.id,
    });
    await callAs(admin, "gestures.update", {
      expectedUpdatedAt: detail.updatedAt,
      id: hond.id,
      keywords: ["pup"],
    });
    expect(await keywordsOf(hond.id)).toEqual(["pup", "clebs", "chienchien"]);
    const read = await callAs<{ keywords: string[] }>(admin, "gestures.get", {
      id: hond.id,
    });
    expect(read.keywords).toEqual(["pup"]);
  });

  it("takes thirty keywords in one save (the bound-variable limit)", async () => {
    const gesture = await addGesture({ name: "Veel" });
    const keywords = Array.from({ length: 30 }, (_, index) => `woord${index}`);
    await save(admin, {
      expectedUpdatedAt: null,
      id: gesture.id,
      keywords,
      name: "Beaucoup",
    });
    expect(await keywordsOf(gesture.id, "fr")).toEqual(keywords);
  });

  it("is CONFLICT stale when the translation changed since it was read, and writes nothing", async () => {
    const gesture = await addGesture({ name: "Kat" });
    const first = await save(admin, {
      expectedUpdatedAt: null,
      id: gesture.id,
      name: "Chat",
    });
    // Someone else saved first: this editor still thinks there is no row.
    const lost = await failure(
      save(translator, {
        expectedUpdatedAt: null,
        id: gesture.id,
        name: "Minou",
      })
    );
    expect(lost).toMatchObject({ code: "CONFLICT", data: { reason: "stale" } });
    // A wrong timestamp is stale too.
    expect(
      (
        await failure(
          save(translator, {
            expectedUpdatedAt: first.updatedAt - 1,
            id: gesture.id,
            name: "Minou",
          })
        )
      ).code
    ).toBe("CONFLICT");
    const [stored] = await testDb()
      .select({ name: gestureTranslation.name })
      .from(gestureTranslation)
      .where(eq(gestureTranslation.gestureId, gesture.id));
    expect(stored?.name).toBe("Chat");
    // With what it read, the save lands and a later save of that one is stale.
    const second = await save(translator, {
      expectedUpdatedAt: first.updatedAt,
      id: gesture.id,
      name: "Minou",
    });
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it("writes nothing and no audit entry when nothing differs", async () => {
    const gesture = await addGesture({ name: "Vis" });
    const first = await save(admin, {
      description: "Nage.",
      expectedUpdatedAt: null,
      id: gesture.id,
      keywords: ["nager"],
      name: "Poisson",
    });
    const mark = await auditMark();
    const version = await catalogVersion();
    const again = await save(admin, {
      description: "Nage.",
      expectedUpdatedAt: first.updatedAt,
      id: gesture.id,
      keywords: ["nager"],
      name: "Poisson",
    });
    expect(again).toEqual(first);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(await catalogVersion()).toBe(version);
  });

  it("records only the parts that changed", async () => {
    const gesture = await addGesture({ name: "Paard" });
    const first = await save(admin, {
      expectedUpdatedAt: null,
      id: gesture.id,
      name: "Cheval",
    });
    const mark = await auditMark();
    await save(admin, {
      description: "Un cheval.",
      expectedUpdatedAt: first.updatedAt,
      id: gesture.id,
      name: "Cheval",
    });
    const [entry] = await auditRowsSince(mark);
    expect(entry?.data).toMatchObject({
      created: false,
      fields: ["description"],
    });
  });

  it("refuses the default language, a disabled one, an unknown one and an unknown gesture", async () => {
    const gesture = await addGesture({ name: "Muis" });
    const refused = await Promise.all(
      ["nl", "de", "xx"].map((locale) =>
        failure(
          save(admin, {
            expectedUpdatedAt: null,
            id: gesture.id,
            locale,
            name: "Souris",
          })
        )
      )
    );
    expect(refused.map((error) => error.code)).toEqual([
      "VALIDATION",
      "VALIDATION",
      "VALIDATION",
    ]);
    await testDb()
      .update(language)
      .set({ enabled: false })
      .where(eq(language.code, "en"));
    try {
      expect(
        (
          await failure(
            save(admin, {
              expectedUpdatedAt: null,
              id: gesture.id,
              locale: "en",
              name: "Mouse",
            })
          )
        ).code
      ).toBe("VALIDATION");
    } finally {
      await testDb()
        .update(language)
        .set({ enabled: true })
        .where(eq(language.code, "en"));
    }
    expect(
      (
        await failure(
          save(admin, {
            expectedUpdatedAt: null,
            id: "unknown-id",
            name: "Souris",
          })
        )
      ).code
    ).toBe("NOT_FOUND");
    expect(await keywordsOf(gesture.id)).toEqual([]);
  });
});

describe("catalogTranslation.gestures.list, get and reports", () => {
  it("lists with the language's translation, filters to what needs translation and counts", async () => {
    const aap = await addGesture({ keywords: ["banaan"], name: "Aap" });
    const beer = await addGesture({ name: "Beer" });
    await addGesture({ name: "Cavia" });
    await save(admin, {
      expectedUpdatedAt: null,
      id: aap.id,
      keywords: ["singe"],
      name: "Singe",
    });
    await save(admin, {
      expectedUpdatedAt: null,
      id: beer.id,
      name: "Ours",
    });

    const all = await callTranslation<{
      items: {
        name: string;
        needsTranslation: boolean;
        translation: { name: string } | null;
      }[];
      report: { gestures: { needsTranslation: number; total: number } };
    }>(translator, "gestures.list", { locale: "fr" });
    const mine = all.items.filter((item) =>
      ["Aap", "Beer", "Cavia"].includes(item.name)
    );
    expect(
      mine.map((item) => [
        item.name,
        item.needsTranslation,
        item.translation?.name ?? null,
      ])
    ).toEqual([
      ["Aap", false, "Singe"],
      ["Beer", false, "Ours"],
      ["Cavia", true, null],
    ]);

    const needs = await callTranslation<{ items: { name: string }[] }>(
      translator,
      "gestures.list",
      { locale: "fr", status: "needs" }
    );
    expect(needs.items.map((item) => item.name)).toContain("Cavia");
    expect(needs.items.map((item) => item.name)).not.toContain("Aap");

    const reports = await callTranslation<
      {
        gestures: { needsTranslation: number; total: number };
        locale: string;
      }[]
    >(translator, "reports");
    expect(reports.map((report) => report.locale)).toEqual(["en", "fr"]);
    const fr = reports.find((report) => report.locale === "fr");
    expect(fr?.gestures.total).toBe(all.report.gestures.total);
    expect(fr?.gestures.needsTranslation).toBe(
      all.report.gestures.needsTranslation
    );
  });

  it("pages by the Dutch name and searches it", async () => {
    await addGesture({ name: "Zzpagina een" });
    await addGesture({ name: "Zzpagina twee" });
    const first = await callTranslation<{
      items: { name: string }[];
      nextCursor: string | null;
    }>(admin, "gestures.list", { limit: 1, locale: "fr", q: "zzpagina" });
    expect(first.items.map((item) => item.name)).toEqual(["Zzpagina een"]);
    expect(first.nextCursor).not.toBeNull();
    const second = await callTranslation<{ items: { name: string }[] }>(
      admin,
      "gestures.list",
      { cursor: first.nextCursor, limit: 1, locale: "fr", q: "zzpagina" }
    );
    expect(second.items.map((item) => item.name)).toEqual(["Zzpagina twee"]);
    expect(
      (
        await failure(
          callTranslation(admin, "gestures.list", {
            cursor: "garbage",
            locale: "fr",
          })
        )
      ).code
    ).toBe("VALIDATION");
  });

  it("gets the source and every translation with its own keywords and lock", async () => {
    const gesture = await addGesture({ keywords: ["hondje"], name: "Hond" });
    const fr = await save(admin, {
      expectedUpdatedAt: null,
      id: gesture.id,
      keywords: ["toutou"],
      name: "Chien",
    });
    await save(admin, {
      expectedUpdatedAt: null,
      id: gesture.id,
      locale: "en",
      name: "Dog",
    });
    const detail = await callTranslation<{
      source: { keywords: string[]; name: string };
      translations: Record<
        string,
        { keywords: string[]; name: string; updatedAt: number }
      >;
    }>(translator, "gestures.get", { id: gesture.id });
    expect(detail.source).toMatchObject({ keywords: ["hondje"], name: "Hond" });
    expect(Object.keys(detail.translations).sort()).toEqual(["en", "fr"]);
    expect(detail.translations.fr).toEqual({
      description: "",
      keywords: ["toutou"],
      name: "Chien",
      updatedAt: fr.updatedAt,
    });
    expect(detail.translations).toMatchObject({ en: { keywords: [] } });
    expect(
      (await failure(callTranslation(admin, "gestures.get", { id: "nope" })))
        .code
    ).toBe("NOT_FOUND");
  });
});

describe("catalogTranslation.categories", () => {
  it("saves a name, rebuilds the language's rows of its gestures and finds them by it", async () => {
    const dieren = await addCategory("Dieren");
    const hond = await addGesture({ categories: [dieren], name: "Hond" });
    await save(admin, { expectedUpdatedAt: null, id: hond.id, name: "Chien" });
    const mark = await auditMark();

    const saved = await callTranslation<Saved>(translator, "categories.save", {
      expectedUpdatedAt: null,
      id: dieren.id,
      locale: "fr",
      name: "Animaux",
    });
    const rows = await ftsRows(hond.id);
    expect(rows.find((row) => row.locale === "fr")?.categories).toBe("Animaux");
    expect(rows.find((row) => row.locale === "nl")?.categories).toBe("Dieren");
    const found = await searchGestures(
      { db: testDb(), kv: env.KV, locale: "fr" },
      { limit: 10, q: "animaux" }
    );
    expect(found.items.map((item) => item.name)).toEqual(["Chien"]);
    expect(await auditRowsSince(mark)).toEqual([
      {
        action: "translation.category_save",
        actorId: translator.user.id,
        data: {
          created: true,
          locale: "fr",
          name: "Dieren",
          slug: dieren.slug,
        },
        targetId: dieren.id,
        targetType: "category",
      },
    ]);

    const list = await callTranslation<{
      items: {
        id: string;
        needsTranslation: boolean;
        translation: { name: string; updatedAt: number } | null;
      }[];
    }>(admin, "categories.list", { locale: "fr" });
    expect(list.items.find((item) => item.id === dieren.id)).toMatchObject({
      needsTranslation: false,
      translation: { name: "Animaux", updatedAt: saved.updatedAt },
    });
    const needs = await callTranslation<{ items: { id: string }[] }>(
      admin,
      "categories.list",
      { locale: "fr", status: "needs" }
    );
    expect(needs.items.some((item) => item.id === dieren.id)).toBe(false);
  });

  it("is stale-locked, a no-op writes nothing and the default language is refused", async () => {
    const eten = await addCategory("Eten");
    const first = await callTranslation<Saved>(admin, "categories.save", {
      expectedUpdatedAt: null,
      id: eten.id,
      locale: "fr",
      name: "Nourriture",
    });
    expect(
      (
        await failure(
          callTranslation(translator, "categories.save", {
            expectedUpdatedAt: null,
            id: eten.id,
            locale: "fr",
            name: "Manger",
          })
        )
      ).code
    ).toBe("CONFLICT");
    const mark = await auditMark();
    expect(
      await callTranslation(admin, "categories.save", {
        expectedUpdatedAt: first.updatedAt,
        id: eten.id,
        locale: "fr",
        name: "Nourriture",
      })
    ).toEqual(first);
    expect(await auditRowsSince(mark)).toEqual([]);
    expect(
      (
        await failure(
          callTranslation(admin, "categories.save", {
            expectedUpdatedAt: null,
            id: eten.id,
            locale: "nl",
            name: "Eten",
          })
        )
      ).code
    ).toBe("VALIDATION");
    const [row] = await testDb()
      .select({ name: categoryTranslation.name })
      .from(categoryTranslation)
      .where(eq(categoryTranslation.categoryId, eten.id));
    expect(row?.name).toBe("Nourriture");
  });
});
