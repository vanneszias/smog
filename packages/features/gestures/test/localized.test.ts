import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import {
  type Category,
  categoryTranslation,
  type Gesture,
  gestureKeyword,
  gestureTranslation,
} from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { recordingD1, scanReport } from "@smog/db/testing";
import { makeRpcContext } from "@smog/rpc/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bumpCatalogVersion,
  gesturesRouter,
  reindexGesture,
} from "../src/server";
import { addCategory, addGesture, resetCatalog } from "./helpers";

/*
 * Phase 10b task 5: the catalogue in a second language. A translated
 * gesture shows its own name, description, keywords and category names; an
 * untranslated one shows the default (Dutch) text and says so
 * (`fallbackUsed`). Search follows the language (accent-insensitive in
 * French), and still finds an untranslated gesture by its Dutch name.
 */

let db: Db;

function context(locale: string) {
  return makeRpcContext({ db, kv: env.KV, locale });
}

interface Translation {
  description?: string;
  keywords?: string[];
  name: string;
}

async function translate(
  gesture: Gesture,
  locale: string,
  translation: Translation
): Promise<void> {
  await db.insert(gestureTranslation).values({
    description: translation.description ?? "",
    gestureId: gesture.id,
    locale,
    name: translation.name,
  });
  const keywords = translation.keywords ?? [];
  if (keywords.length > 0) {
    await db.insert(gestureKeyword).values(
      keywords.map((keyword, position) => ({
        gestureId: gesture.id,
        keyword,
        locale,
        position,
      }))
    );
  }
  await reindexGesture(db, gesture.id);
  await bumpCatalogVersion(env.KV);
}

async function translateCategory(
  row: Category,
  locale: string,
  name: string
): Promise<void> {
  await db
    .insert(categoryTranslation)
    .values({ categoryId: row.id, locale, name });
  await bumpCatalogVersion(env.KV);
}

interface Fixture {
  actie: Category;
  dieren: Category;
  hond: Gesture;
  kat: Gesture;
  vis: Gesture;
}

/** Hond (fully translated), Kat (not translated), Vis (translated, no keywords). */
async function seed(): Promise<Fixture> {
  const dieren = await addCategory(db, "Dieren");
  const actie = await addCategory(db, "Actie");
  const hond = await addGesture(db, {
    categories: [dieren],
    description: "Een trouwe hond.",
    keywords: ["hondje", "huisdier"],
    name: "Hond",
  });
  const kat = await addGesture(db, {
    categories: [dieren],
    description: "Een poes.",
    keywords: ["poes"],
    name: "Kat",
  });
  const vis = await addGesture(db, {
    categories: [dieren, actie],
    description: "Zwemt.",
    keywords: ["zwemmen"],
    name: "Vis",
  });
  await translateCategory(dieren, "fr", "Animaux");
  await translateCategory(dieren, "en", "Animals");
  await translate(hond, "fr", {
    description: "Un chien fidèle.",
    keywords: ["toutou", "animal de compagnie"],
    name: "Chien",
  });
  await translate(hond, "en", {
    description: "A loyal dog.",
    keywords: ["pup", "pet"],
    name: "Dog",
  });
  await translate(vis, "fr", { description: "Nage.", name: "Poisson" });
  return { actie, dieren, hond, kat, vis };
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetCatalog();
});

describe("the catalogue reads in a language", () => {
  it("lists translated names and category names, the Dutch text and fallbackUsed for what is not translated", async () => {
    await seed();
    const { items } = await call(
      gesturesRouter.list,
      {},
      { context: context("fr") }
    );
    expect(
      items.map((item) => [item.name, item.fallbackUsed, item.categories])
    ).toEqual([
      // Catalogue order stays the Dutch sort name: Hond, Kat, Vis.
      ["Chien", false, [{ name: "Animaux", slug: "dieren" }]],
      ["Kat", true, [{ name: "Animaux", slug: "dieren" }]],
      [
        "Poisson",
        false,
        [
          { name: "Actie", slug: "actie" },
          { name: "Animaux", slug: "dieren" },
        ],
      ],
    ]);
  });

  it("is unchanged in the default language (no fallback flag, base text)", async () => {
    await seed();
    const { items } = await call(
      gesturesRouter.list,
      {},
      { context: context("nl") }
    );
    expect(items.map((item) => [item.name, item.fallbackUsed])).toEqual([
      ["Hond", false],
      ["Kat", false],
      ["Vis", false],
    ]);
  });

  it("returns the translated detail with its own keywords, the Dutch ones when untranslated", async () => {
    await seed();
    const dog = await call(
      gesturesRouter.bySlug,
      { slug: "hond" },
      { context: context("en") }
    );
    expect(dog).toMatchObject({
      description: "A loyal dog.",
      fallbackUsed: false,
      keywords: ["pup", "pet"],
      name: "Dog",
    });
    // Slug is one per gesture, from the Dutch name.
    expect(dog.slug).toBe("hond");

    const cat = await call(
      gesturesRouter.bySlug,
      { slug: "kat" },
      { context: context("en") }
    );
    expect(cat).toMatchObject({
      description: "Een poes.",
      fallbackUsed: true,
      keywords: ["poes"],
      name: "Kat",
    });

    // Translated, but no keywords in that language: none are invented.
    const fish = await call(
      gesturesRouter.bySlug,
      { slug: "vis" },
      { context: context("fr") }
    );
    expect(fish).toMatchObject({
      description: "Nage.",
      fallbackUsed: false,
      keywords: [],
      name: "Poisson",
    });
  });

  it("falls back to the Dutch description when the translated one is blank", async () => {
    const { vis } = await seed();
    await db
      .insert(gestureTranslation)
      .values({ gestureId: vis.id, locale: "en", name: "Fish" });
    const fish = await call(
      gesturesRouter.bySlug,
      { slug: "vis" },
      { context: context("en") }
    );
    expect(fish.name).toBe("Fish");
    expect(fish.description).toBe("Zwemt.");
  });

  it("localizes the category list and the by-id and related reads", async () => {
    const { hond } = await seed();
    expect(
      await call(gesturesRouter.categories, undefined, {
        context: context("fr"),
      })
    ).toEqual([
      { fallbackUsed: true, gestureCount: 1, name: "Actie", slug: "actie" },
      {
        fallbackUsed: false,
        gestureCount: 3,
        name: "Animaux",
        slug: "dieren",
      },
    ]);
    const byIds = await call(
      gesturesRouter.byIds,
      { ids: [hond.id] },
      { context: context("fr") }
    );
    expect(byIds.map((item) => item.name)).toEqual(["Chien"]);
    const related = await call(
      gesturesRouter.related,
      { limit: 5, slug: "hond" },
      { context: context("fr") }
    );
    expect(related.map((item) => [item.name, item.fallbackUsed])).toEqual([
      ["Kat", true],
      ["Poisson", false],
    ]);
  });

  it("keeps one projection per language in the isolate", async () => {
    await seed();
    const fr = await call(gesturesRouter.categories, undefined, {
      context: context("fr"),
    });
    const en = await call(gesturesRouter.categories, undefined, {
      context: context("en"),
    });
    const nl = await call(gesturesRouter.categories, undefined, {
      context: context("nl"),
    });
    expect([fr[1]?.name, en[1]?.name, nl[1]?.name]).toEqual([
      "Animaux",
      "Animals",
      "Dieren",
    ]);
  });
});

describe("search in a language", () => {
  async function names(q: string, locale: string): Promise<string[]> {
    const { items } = await call(
      gesturesRouter.search,
      { limit: 20, q },
      { context: context(locale) }
    );
    return items.map((item) => item.name);
  }

  it("matches the translated name and keywords, accent-insensitive", async () => {
    await seed();
    expect(await names("chien", "fr")).toEqual(["Chien"]);
    // Keyword, with and without the accent of the stored text.
    expect(await names("fidele", "fr")).toEqual(["Chien"]);
    expect(await names("toutou", "fr")).toEqual(["Chien"]);
    expect(await names("poisson", "fr")).toEqual(["Poisson"]);
    expect(await names("pup", "en")).toEqual(["Dog"]);
    // The category name in the language matches its gestures.
    expect(await names("animaux", "fr")).toEqual(["Chien", "Poisson", "Kat"]);
    expect(await names("animals", "en")).toContain("Dog");
  });

  it("does not match the other languages' words", async () => {
    await seed();
    expect(await names("toutou", "en")).toEqual([]);
    expect(await names("pup", "fr")).toEqual([]);
    // A translated gesture is not found by its Dutch name in French.
    expect(await names("hond", "fr")).toEqual([]);
  });

  it("still finds an untranslated gesture by its Dutch name, flagged", async () => {
    await seed();
    const { items } = await call(
      gesturesRouter.search,
      { limit: 20, q: "kat" },
      { context: context("en") }
    );
    expect(items.map((item) => [item.name, item.fallbackUsed])).toEqual([
      ["Kat", true],
    ]);
    // Dutch keywords of an untranslated gesture count too (the fallback row).
    expect(await names("poes", "en")).toEqual(["Kat"]);
  });

  it("searches Dutch exactly as before in nl", async () => {
    await seed();
    expect(await names("hond", "nl")).toEqual(["Hond"]);
    expect(await names("chien", "nl")).toEqual([]);
    expect(await names("hondje", "nl")).toEqual(["Hond"]);
  });

  it("runs the typo tier on the language's projection", async () => {
    await seed();
    expect(await names("poison", "fr")).toEqual(["Poisson"]);
    const { items } = await call(
      gesturesRouter.search,
      { limit: 20, q: "chein" },
      { context: context("fr") }
    );
    expect(items.map((item) => [item.name, item.matchType])).toEqual([
      ["Chien", "fuzzy"],
    ]);
    // The Dutch typo does not find the French name, but an untranslated
    // gesture's Dutch name is in every projection.
    expect(await names("kta", "en")).toEqual(["Kat"]);
  });

  it("reflects a translation written after the first search (a catalog bump)", async () => {
    const { kat } = await seed();
    expect(await names("minou", "fr")).toEqual([]);
    await translate(kat, "fr", { keywords: ["minou"], name: "Chat" });
    expect(await names("minou", "fr")).toEqual(["Chat"]);
    expect(await names("kat", "fr")).toEqual([]);
  });

  it("browses the whole catalogue in the language, in Dutch name order", async () => {
    await seed();
    expect(await names("", "fr")).toEqual(["Chien", "Kat", "Poisson"]);
  });
});

describe("the query plans of a search in a language", () => {
  it("seeks indexes (the translation probes and the full-text match)", async () => {
    await seed();
    const { d1, statements } = recordingD1(env.DB);
    const recording = createDb(d1);
    await call(
      gesturesRouter.search,
      { limit: 20, q: "chien" },
      {
        context: makeRpcContext({
          db: recording,
          kv: env.KV,
          locale: "fr",
        }),
      }
    );
    await call(
      gesturesRouter.list,
      {},
      {
        context: makeRpcContext({
          db: recording,
          kv: env.KV,
          locale: "fr",
        }),
      }
    );
    await call(
      gesturesRouter.bySlug,
      { slug: "hond" },
      {
        context: makeRpcContext({
          db: recording,
          kv: env.KV,
          locale: "fr",
        }),
      }
    );
    expect(statements.length).toBeGreaterThan(2);
    const report = await scanReport(
      env.DB,
      statements,
      (detail, sql) =>
        // The category list and the typo tier's projection read whole
        // (small, KV-cached) tables by design, as in the nl plan test; the
        // translation tables are only ever probed by key.
        detail === "SCAN category" ||
        (detail.startsWith("SCAN gesture USING INDEX") &&
          !sql.toLowerCase().includes("limit"))
    );
    expect(report.scans, report.plans.join("\n")).toEqual([]);
  });
});
