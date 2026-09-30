import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { gesture } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeRpcContext } from "@smog/rpc/testing";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bumpCatalogVersion,
  CATALOG_VERSION_KEY,
  gesturesRouter,
  getCatalogProjection,
  INITIAL_CATALOG_VERSION,
  reindexGesture,
} from "../src/server";
import {
  addCategory,
  addGesture,
  countingD1,
  resetCatalog,
  spyKv,
} from "./helpers";

let db: Db;

function context(database: Db = db) {
  return makeRpcContext({ db: database, kv: env.KV });
}

async function search(
  q: string,
  extra: { category?: string[]; limit?: number } = {}
) {
  return await call(
    gesturesRouter.search,
    { q, ...extra },
    { context: context() }
  );
}

function names(result: { items: { name: string }[] }): string[] {
  return result.items.map((item) => item.name);
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetCatalog();
  const dieren = await addCategory(db, "Dieren");
  const eten = await addCategory(db, "Eten en drinken");
  const begroeten = await addCategory(db, "Begroeten");
  await addGesture(db, {
    categories: [dieren],
    description: "Een hond.",
    keywords: ["hondje", "huisdier"],
    name: "Hond",
  });
  await addGesture(db, {
    categories: [dieren],
    description: "Een jonge hond.",
    keywords: ["huisdier"],
    name: "Puppy",
  });
  await addGesture(db, {
    categories: [dieren],
    description: "Blaffen als een hond.",
    name: "Blaffen",
  });
  await addGesture(db, {
    categories: [eten],
    description: "Een kop koffie.",
    keywords: ["café", "espresso"],
    name: "Koffie",
  });
  await addGesture(db, {
    categories: [begroeten],
    description: "Iemand 's ochtends begroeten.",
    keywords: ["ochtend", "morgen"],
    name: "Goedemorgen",
  });
  await addGesture(db, {
    categories: [begroeten],
    keywords: ["tot ziens", "daag"],
    name: "Dag",
  });
  await addGesture(db, {
    categories: [dieren],
    keywords: ["hond"],
    name: "Geheime hond",
    published: false,
  });
});

describe("gestures.search", () => {
  it("returns FTS matches ranked by field and tier", async () => {
    const result = await search("hond");

    // Blaffen and Puppy tie on their descriptions; the name decides.
    expect(names(result)).toEqual(["Hond", "Blaffen", "Puppy"]);
    expect(result.total).toBe(3);
    expect(result.items[0]).toMatchObject({
      matchedField: "name",
      matchType: "exact",
      score: 100_000,
      slug: "hond",
    });
    expect(result.items[1]).toMatchObject({
      matchedField: "description",
      matchType: "wordBoundary",
      score: 2500,
    });
  });

  it("is accent-insensitive both ways", async () => {
    expect(names(await search("cafe"))).toEqual(["Koffie"]);
    expect(names(await search("CAFÉ"))).toEqual(["Koffie"]);
  });

  it("prefix-matches every word of a multi-word query", async () => {
    expect(names(await search("tot zie"))).toEqual(["Dag"]);
    expect(names(await search("goede"))).toEqual(["Goedemorgen"]);
    expect(names(await search("ochtend begr"))).toEqual(["Goedemorgen"]);
  });

  it("filters by any of the categories (OR)", async () => {
    expect(
      names(await search("een", { category: ["eten-en-drinken"] }))
    ).toEqual(["Koffie"]);
    const both = await search("een", {
      category: ["dieren", "eten-en-drinken"],
    });
    expect(new Set(names(both))).toEqual(
      new Set(["Hond", "Puppy", "Blaffen", "Koffie"])
    );
  });

  it("never returns unpublished gestures", async () => {
    expect(names(await search("geheime"))).toEqual([]);
  });

  it("adds the typo tier when fewer than 5 direct results remain", async () => {
    const result = await search("hnd");

    expect(result.items[0]).toMatchObject({
      matchedField: "name",
      matchType: "fuzzy",
      name: "Hond",
    });
    const [hond] = result.items;
    expect(hond?.playbackId).toBeTruthy();
    expect(hond?.categories).toEqual([{ name: "Dieren", slug: "dieren" }]);
  });

  it("appends typo matches after direct ones, without duplicates", async () => {
    const result = await search("koffe");

    expect(result.items.map((item) => [item.name, item.matchType])).toEqual([
      ["Koffie", "fuzzy"],
    ]);
    const direct = await search("koffie");
    expect(direct.items.map((item) => [item.name, item.matchType])).toEqual([
      ["Koffie", "exact"],
    ]);
  });

  it("keeps the category filter in the typo tier", async () => {
    expect(names(await search("hnd", { category: ["begroeten"] }))).toEqual([]);
  });

  it("skips the typo tier with 5 or more direct results", async () => {
    await Promise.all(
      ["Kat", "Kater", "Katje", "Katten", "Kattenbak", "Kad"].map((name) =>
        addGesture(db, { name })
      )
    );

    const result = await search("kat");
    expect(result.items.every((item) => item.matchType !== "fuzzy")).toBe(true);
    expect(names(result)).not.toContain("Kad");
  });

  it("returns the browse list in name order for an empty query", async () => {
    const result = await search("  ", { limit: 3 });
    expect(names(result)).toEqual(["Blaffen", "Dag", "Goedemorgen"]);
    expect(result.total).toBe(6);
    expect(result.items[0]).toMatchObject({
      matchedField: null,
      matchType: null,
      score: 0,
    });

    const filtered = await search("", { category: ["begroeten"] });
    expect(names(filtered)).toEqual(["Dag", "Goedemorgen"]);
    expect(filtered.total).toBe(2);
  });

  it("does not throw on FTS syntax in the query", async () => {
    const queries = [
      '"',
      '"hond',
      "hond*",
      "-hond",
      "(hond",
      "hond OR kat",
      "NEAR(",
      "a:b",
      "*",
    ];
    const results = await Promise.all(queries.map((q) => search(q)));
    for (const result of results) {
      expect(Array.isArray(result.items)).toBe(true);
    }
    expect(names(await search('"hond" OR -kat*'))).toEqual([]);
    expect(names(await search("(hond)"))).toEqual(["Hond", "Blaffen", "Puppy"]);
  });

  it("limits the page but counts every match", async () => {
    const result = await search("een", { limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(4);
  });

  it("uses at most 2 D1 round trips on a cold isolate, typo tier included", async () => {
    await bumpCatalogVersion(env.KV);
    const counted = countingD1(env.DB);
    const result = await call(
      gesturesRouter.search,
      { q: "hnd" },
      { context: context(createDb(counted.d1)) }
    );
    expect(result.items[0]).toMatchObject({ matchType: "fuzzy", name: "Hond" });
    expect(counted.count()).toBeLessThanOrEqual(2);
  });

  it("uses 1 D1 round trip once the snapshot is warm", async () => {
    await search("hnd");
    const counted = countingD1(env.DB);
    await call(
      gesturesRouter.search,
      { q: "hnd" },
      { context: context(createDb(counted.d1)) }
    );
    expect(counted.count()).toBe(1);
  });

  it("keeps the search page's SSR at 3 D1 reads: the session, the search, then categories from the same snapshot", async () => {
    await bumpCatalogVersion(env.KV);
    const counted = countingD1(env.DB);
    const cold = context(createDb(counted.d1));
    // The order of `prefetchBrowse` for a query.
    await call(gesturesRouter.search, { q: "hond" }, { context: cold });
    const categories = await call(gesturesRouter.categories, undefined, {
      context: cold,
    });
    expect(categories.map((item) => item.name)).toEqual([
      "Begroeten",
      "Dieren",
      "Eten en drinken",
    ]);
    // The session read is the third.
    expect(counted.count()).toBe(2);
  });

  it("drops a typo match unpublished after this isolate loaded the snapshot", async () => {
    // Warm the snapshot with Hond published, then unpublish it without a
    // bump (a stale isolate within KV's propagation delay).
    await search("hnd");
    await db
      .update(gesture)
      .set({ publishedAt: null })
      .where(eq(gesture.name, "Hond"));
    const result = await search("hnd");
    expect(names(result)).not.toContain("Hond");
    expect(result.total).toBe(result.items.length);
  });
});

describe("reindexGesture", () => {
  it("makes a renamed gesture findable by its new name", async () => {
    const [row] = await db
      .update(gesture)
      .set({ name: "Zebrafant" })
      .where(eq(gesture.slug, "blaffen"))
      .returning();
    // Only the typo tier (which reads the tables) finds it before the reindex.
    expect(
      (await search("zebrafant")).items.map((item) => item.matchType)
    ).toEqual(["fuzzy"]);

    await reindexGesture(db, row?.id ?? "");

    expect((await search("zebrafant")).items[0]).toMatchObject({
      matchType: "exact",
      name: "Zebrafant",
    });
    // The old name is gone; only its description still says "Blaffen …".
    expect((await search("blaffen")).items).toMatchObject([
      { matchedField: "description", name: "Zebrafant" },
    ]);
  });

  it("removes the row of a deleted gesture", async () => {
    const [row] = await db
      .delete(gesture)
      .where(eq(gesture.slug, "dag"))
      .returning();
    await reindexGesture(db, row?.id ?? "");

    const left = await env.DB.prepare(
      "SELECT count(*) AS n FROM gesture_fts WHERE gesture_id = ?"
    )
      .bind(row?.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});

describe("catalog projection", () => {
  it("is cached per isolate until the version key changes", async () => {
    const version = await env.KV.get(CATALOG_VERSION_KEY);
    const first = await getCatalogProjection(db, env.KV);
    expect(first.map((entry) => entry.id)).toHaveLength(6);

    await addGesture(db, { name: "Olifant" });
    expect(await getCatalogProjection(db, env.KV)).toBe(first);

    await bumpCatalogVersion(env.KV);
    expect(await env.KV.get(CATALOG_VERSION_KEY)).not.toBe(version);
    const next = await getCatalogProjection(db, env.KV);
    expect(next).toHaveLength(7);
    expect(next.find((entry) => entry.name === "olifant")).toBeDefined();
  });

  it("never writes KV on the read path; a missing key is the initial version", async () => {
    await env.KV.delete(CATALOG_VERSION_KEY);
    const kv = spyKv(env.KV);
    const spied = makeRpcContext({ db, kv: kv.binding });

    expect(await getCatalogProjection(db, kv.binding)).toHaveLength(6);
    expect(
      await call(gesturesRouter.search, { q: "hnd" }, { context: spied })
    ).toMatchObject({ items: [{ name: "Hond" }] });
    expect(kv.writes).toBe(0);
    expect(await env.KV.get(CATALOG_VERSION_KEY)).toBeNull();
    expect(INITIAL_CATALOG_VERSION).toBe("initial");
  });

  it("loads per concurrent cold miss, then serves the cached projection", async () => {
    await bumpCatalogVersion(env.KV);
    const counted = countingD1(env.DB);
    const countedDb = createDb(counted.d1);

    // No promise is shared between requests: each cold miss loads on its own.
    const cold = await Promise.all([
      getCatalogProjection(countedDb, env.KV),
      getCatalogProjection(countedDb, env.KV),
    ]);
    expect(counted.count()).toBe(2);
    expect(cold[0]).toEqual(cold[1]);

    // The resolved projection (plain data) is then served from memory.
    const warm = await getCatalogProjection(countedDb, env.KV);
    expect(counted.count()).toBe(2);
    expect(cold).toContain(warm);
  });

  it("reads the version key with a 60 s KV cacheTtl", async () => {
    const kv = spyKv(env.KV);
    await getCatalogProjection(db, kv.binding);
    expect(kv.gets).toEqual([[CATALOG_VERSION_KEY, { cacheTtl: 60 }]]);
  });

  it("serves categories from the snapshot until the version changes", async () => {
    const before = await call(gesturesRouter.categories, undefined, {
      context: context(),
    });
    await addCategory(db, "Familie");
    expect(
      await call(gesturesRouter.categories, undefined, { context: context() })
    ).toEqual(before);
    await bumpCatalogVersion(env.KV);
    const after = await call(gesturesRouter.categories, undefined, {
      context: context(),
    });
    expect(after.map((item) => item.name)).toContain("Familie");
  });

  it("holds normalised names, keywords, category names and slugs", async () => {
    const projection = await getCatalogProjection(db, env.KV);
    expect(projection.find((entry) => entry.name === "koffie")).toMatchObject({
      categories: ["eten en drinken"],
      categorySlugs: ["eten-en-drinken"],
      keywords: ["cafe", "espresso"],
      name: "koffie",
    });
  });
});

describe("the typo tier is best effort", () => {
  function failingKv(): KVNamespace {
    return {
      get: () => Promise.reject(new Error("KV unavailable")),
      put: () => Promise.reject(new Error("KV unavailable")),
    } as unknown as KVNamespace;
  }

  it("answers with the direct matches when KV fails", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await call(
      gesturesRouter.search,
      { q: "hond" },
      { context: makeRpcContext({ db, kv: failingKv() }) }
    );

    expect(names(result)).toEqual(["Hond", "Blaffen", "Puppy"]);
    expect(result.total).toBe(3);
    expect(errors.mock.calls.map((args) => String(args[0]))).toContain(
      "[gestures] Failed to load the typo tier, answering with direct matches:"
    );
    errors.mockRestore();
  });

  it("answers with no results, not an error, when only typos could match", async () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = await call(
      gesturesRouter.search,
      { q: "hnd" },
      { context: makeRpcContext({ db, kv: failingKv() }) }
    );
    expect(result).toEqual({ items: [], total: 0 });
    errors.mockRestore();
  });
});
