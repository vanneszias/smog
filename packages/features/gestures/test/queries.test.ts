import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { Category } from "@smog/db";
import { createDb, type Db } from "@smog/db/client";
import { makeRpcContext } from "@smog/rpc/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { gesturesRouter } from "../src/server";
import { listGesturesQuery } from "../src/server/queries";
import {
  addCategory,
  addGesture,
  addSponsorship,
  countingD1,
  resetCatalog,
} from "./helpers";

let db: Db;

function context(database: Db = db) {
  return makeRpcContext({ db: database, kv: env.KV });
}

beforeEach(async () => {
  db = createDb(env.DB);
  await resetCatalog();
});

describe("gestures.list", () => {
  it("pages through the catalogue by name with a keyset cursor", async () => {
    const dieren = await addCategory(db, "Dieren");
    await Promise.all(
      ["kat", "Hond", "Aap", "vogel", "Beer"].map((name) =>
        addGesture(db, { categories: [dieren], name })
      )
    );

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor.
      const page = await call(
        gesturesRouter.list,
        { category: ["dieren"], cursor, limit: 2 },
        { context: context() }
      );
      pages += 1;
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.name));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(pages).toBe(3);
    // Case-insensitive name order, every gesture once.
    expect(seen).toEqual(["Aap", "Beer", "Hond", "kat", "vogel"]);
  });

  it("sorts accented names with their letter: Één before Zus", async () => {
    await Promise.all(
      ["Zus", "Één", "Eend", "appel", "Ölie"].map((name) =>
        addGesture(db, { name })
      )
    );

    const first = await call(
      gesturesRouter.list,
      { limit: 2 },
      { context: context() }
    );
    const rest = await call(
      gesturesRouter.list,
      { cursor: first.nextCursor ?? undefined, limit: 10 },
      { context: context() }
    );
    const order = [...first.items, ...rest.items].map((item) => item.name);
    expect(order).toEqual(["appel", "Één", "Eend", "Ölie", "Zus"]);

    const sitemap = await call(gesturesRouter.sitemap, undefined, {
      context: context(),
    });
    expect(sitemap.map((entry) => entry.slug)).toEqual([
      "appel",
      "een",
      "eend",
      "olie",
      "zus",
    ]);
  });

  it("returns summaries with the published categories in category order", async () => {
    const a = await addCategory(db, "Zomer", { sortOrder: 2 });
    const b = await addCategory(db, "Actie", { sortOrder: 1 });
    const hidden = await addCategory(db, "Geheim", { published: false });
    const row = await addGesture(db, {
      categories: [a, b, hidden],
      name: "Zwemmen",
    });

    const { items, nextCursor } = await call(
      gesturesRouter.list,
      {},
      { context: context() }
    );

    expect(nextCursor).toBeNull();
    expect(items).toEqual([
      {
        categories: [
          { name: "Actie", slug: "actie" },
          { name: "Zomer", slug: "zomer" },
        ],
        id: row.id,
        name: "Zwemmen",
        playbackId: row.playbackId,
        slug: "zwemmen",
      },
    ]);
  });

  it("filters by any of the given categories (OR), without duplicates", async () => {
    const dieren = await addCategory(db, "Dieren");
    const familie = await addCategory(db, "Familie");
    const eten = await addCategory(db, "Eten");
    await addGesture(db, { categories: [dieren], name: "Hond" });
    await addGesture(db, { categories: [familie], name: "Mama" });
    await addGesture(db, { categories: [dieren, familie], name: "Huisdier" });
    await addGesture(db, { categories: [eten], name: "Appel" });

    const { items } = await call(
      gesturesRouter.list,
      { category: ["dieren", "familie", "onbekend"] },
      { context: context() }
    );

    expect(items.map((item) => item.name)).toEqual([
      "Hond",
      "Huisdier",
      "Mama",
    ]);
  });

  it("hides unpublished gestures and unpublished categories", async () => {
    const hidden = await addCategory(db, "Verborgen", { published: false });
    const dieren = await addCategory(db, "Dieren");
    await addGesture(db, { categories: [dieren], name: "Hond" });
    await addGesture(db, {
      categories: [dieren],
      name: "Kat",
      published: false,
    });
    await addGesture(db, { categories: [hidden], name: "Geheim" });

    const all = await call(gesturesRouter.list, {}, { context: context() });
    expect(all.items.map((item) => item.name)).toEqual(["Geheim", "Hond"]);
    expect(all.items[0]?.categories).toEqual([]);

    const byHidden = await call(
      gesturesRouter.list,
      { category: ["verborgen"] },
      { context: context() }
    );
    expect(byHidden.items).toEqual([]);
  });

  it("seeks the partial name index for the next page (no scan, no sort)", async () => {
    const { params, sql: text } = listGesturesQuery(
      db,
      undefined,
      { id: "b", sortName: "a" },
      50
    ).toSQL();
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${text}`)
      .bind(...params)
      .all<{ detail: string; parent: number }>();
    // The outer query's own steps (subqueries hang off other parents).
    const outer = plan.results.filter((row) => row.parent === 0);
    expect(outer.map((row) => row.detail)).toContain(
      "SEARCH gesture USING INDEX gesture_published_sort_name_idx (sort_name>?)"
    );
    expect(outer.some((row) => row.detail.includes("TEMP B-TREE"))).toBe(false);
  });

  it("rejects a cursor it did not issue", async () => {
    await expect(
      call(
        gesturesRouter.list,
        { cursor: "not-a-cursor" },
        { context: context() }
      )
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("validates the input with the contract", async () => {
    await expect(
      call(gesturesRouter.list, { limit: 101 }, { context: context() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("gestures.bySlug", () => {
  let dieren: Category;

  beforeEach(async () => {
    dieren = await addCategory(db, "Dieren");
  });

  it("returns the detail by slug", async () => {
    const row = await addGesture(db, {
      categories: [dieren],
      description: "Een hond.",
      keywords: ["hondje", "huisdier", "blaffen"],
      name: "Hond",
    });

    expect(
      await call(
        gesturesRouter.bySlug,
        { slug: "hond" },
        { context: context() }
      )
    ).toEqual({
      canonicalSlug: "hond",
      categories: [{ name: "Dieren", slug: "dieren" }],
      description: "Een hond.",
      id: row.id,
      keywords: ["hondje", "huisdier", "blaffen"],
      name: "Hond",
      playbackId: row.playbackId,
      // The VideoObject `uploadDate` and `dateModified` (epoch ms).
      publishedAt: row.publishedAt?.getTime(),
      slug: "hond",
      sponsor: null,
      updatedAt: row.updatedAt.getTime(),
    });
  });

  it("resolves a legacy (Convex) id and names the canonical slug", async () => {
    await addGesture(db, { legacyId: "j57abc123", name: "Kat" });

    const detail = await call(
      gesturesRouter.bySlug,
      { slug: "j57abc123" },
      { context: context() }
    );

    expect(detail.slug).toBe("kat");
    expect(detail.canonicalSlug).toBe("kat");
  });

  it("prefers a slug over another gesture's legacy id", async () => {
    await addGesture(db, { legacyId: "vogel", name: "Oud" });
    await addGesture(db, { name: "Vogel" });

    const detail = await call(
      gesturesRouter.bySlug,
      { slug: "vogel" },
      { context: context() }
    );
    expect(detail.name).toBe("Vogel");
  });

  it("is NOT_FOUND for unknown and unpublished gestures", async () => {
    await addGesture(db, { name: "Kat", published: false });
    await Promise.all(
      ["onbekend", "kat"].map((slug) =>
        expect(
          call(gesturesRouter.bySlug, { slug }, { context: context() })
        ).rejects.toMatchObject({ code: "NOT_FOUND", defined: true })
      )
    );
  });

  it("plays the sponsored video while a live sponsorship has one", async () => {
    const hond = await addGesture(db, { categories: [dieren], name: "Hond" });
    const until = new Date("2027-09-29T00:00:00.000Z");
    await addSponsorship(db, hond.id, "live", {
      displayName: "Bakkerij Jan",
      endsAt: until,
      videoPlaybackId: "sponsored-playback",
    });

    const detail = await call(
      gesturesRouter.bySlug,
      { slug: "hond" },
      { context: context() }
    );
    expect(detail.playbackId).toBe("sponsored-playback");
    expect(detail.sponsor).toEqual({
      name: "Bakkerij Jan",
      until: until.getTime(),
    });

    // The summaries (list, search, related) play it too.
    const { items } = await call(
      gesturesRouter.list,
      {},
      { context: context() }
    );
    expect(items[0]?.playbackId).toBe("sponsored-playback");
  });

  it("plays the sponsored video while the sponsorship is expiring", async () => {
    const hond = await addGesture(db, { name: "Hond" });
    const until = new Date("2026-10-15T00:00:00.000Z");
    await addSponsorship(db, hond.id, "expiring", {
      endsAt: until,
      videoPlaybackId: "expiring-playback",
    });

    const detail = await call(
      gesturesRouter.bySlug,
      { slug: "hond" },
      { context: context() }
    );
    expect(detail.playbackId).toBe("expiring-playback");
    expect(detail.sponsor).toEqual({
      name: "Bakkerij Jan",
      until: until.getTime(),
    });
  });

  it("ignores expired and changes_requested sponsorships", async () => {
    const aap = await addGesture(db, { name: "Aap" });
    const beer = await addGesture(db, { name: "Beer" });
    await addSponsorship(db, aap.id, "expired", {
      endsAt: new Date("2026-01-01T00:00:00.000Z"),
      videoPlaybackId: "expired-playback",
    });
    await addSponsorship(db, beer.id, "changes_requested", {
      videoPlaybackId: "draft-playback",
    });

    const details = await Promise.all(
      ["aap", "beer"].map((slug) =>
        call(gesturesRouter.bySlug, { slug }, { context: context() })
      )
    );
    expect(details.map((detail) => detail.playbackId)).toEqual([
      aap.playbackId,
      beer.playbackId,
    ]);
    expect(details.map((detail) => detail.sponsor)).toEqual([null, null]);
  });

  it("keeps the original video for a sponsorship that is not running", async () => {
    const kat = await addGesture(db, { name: "Kat" });
    await addSponsorship(db, kat.id, "in_review", {
      videoPlaybackId: "not-yet",
    });

    const detail = await call(
      gesturesRouter.bySlug,
      { slug: "kat" },
      { context: context() }
    );
    expect(detail.playbackId).toBe(kat.playbackId);
    expect(detail.sponsor).toBeNull();
  });

  it("uses one D1 round trip", async () => {
    await addGesture(db, {
      categories: [dieren],
      keywords: ["a"],
      name: "Hond",
    });
    const counted = countingD1(env.DB);

    await call(
      gesturesRouter.bySlug,
      { slug: "hond" },
      { context: context(createDb(counted.d1)) }
    );
    expect(counted.count()).toBe(1);
  });
});

describe("gestures.byIds", () => {
  it("returns published gestures in the order asked, skipping the rest", async () => {
    const a = await addGesture(db, { name: "Aap" });
    const b = await addGesture(db, { name: "Beer" });
    const hidden = await addGesture(db, { name: "Kat", published: false });

    const items = await call(
      gesturesRouter.byIds,
      { ids: [b.id, "missing", hidden.id, a.id, b.id] },
      { context: context() }
    );
    expect(items.map((item) => item.name)).toEqual(["Beer", "Aap"]);
  });

  it("accepts 100 ids and rejects more", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);
    expect(
      await call(gesturesRouter.byIds, { ids }, { context: context() })
    ).toEqual([]);
    await expect(
      call(
        gesturesRouter.byIds,
        { ids: [...ids, "one-more"] },
        { context: context() }
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("gestures.related", () => {
  it("orders by shared categories, then name, and excludes the gesture", async () => {
    const dieren = await addCategory(db, "Dieren");
    const huis = await addCategory(db, "Huis");
    const buiten = await addCategory(db, "Buiten");
    const verborgen = await addCategory(db, "Verborgen", { published: false });
    await addGesture(db, {
      categories: [dieren, huis, verborgen],
      name: "Hond",
    });
    await addGesture(db, { categories: [dieren], name: "Beer" });
    await addGesture(db, { categories: [dieren, huis], name: "Kat" });
    await addGesture(db, { categories: [huis], name: "Aap" });
    await addGesture(db, { categories: [buiten], name: "Boom" });
    await addGesture(db, { categories: [verborgen], name: "Geheim" });
    await addGesture(db, {
      categories: [dieren],
      name: "Uil",
      published: false,
    });

    const related = await call(
      gesturesRouter.related,
      { slug: "hond" },
      { context: context() }
    );
    expect(related.map((item) => item.name)).toEqual(["Kat", "Aap", "Beer"]);

    const limited = await call(
      gesturesRouter.related,
      { limit: 1, slug: "hond" },
      { context: context() }
    );
    expect(limited.map((item) => item.name)).toEqual(["Kat"]);
  });

  it("is empty for an unknown gesture", async () => {
    expect(
      await call(
        gesturesRouter.related,
        { slug: "onbekend" },
        { context: context() }
      )
    ).toEqual([]);
  });
});

describe("gestures.categories", () => {
  it("lists published categories by sort order, then name, with published counts", async () => {
    const dieren = await addCategory(db, "Dieren", { sortOrder: 2 });
    const familie = await addCategory(db, "Familie", { sortOrder: 1 });
    const begroeten = await addCategory(db, "Begroeten", { sortOrder: 1 });
    await addCategory(db, "Verborgen", { published: false });
    await addGesture(db, { categories: [dieren], name: "Hond" });
    await addGesture(db, { categories: [dieren, familie], name: "Huisdier" });
    await addGesture(db, {
      categories: [dieren],
      name: "Kat",
      published: false,
    });

    expect(
      await call(gesturesRouter.categories, undefined, { context: context() })
    ).toEqual([
      { gestureCount: 0, name: "Begroeten", slug: begroeten.slug },
      { gestureCount: 1, name: "Familie", slug: "familie" },
      { gestureCount: 2, name: "Dieren", slug: "dieren" },
    ]);
  });
});

describe("gestures.sitemap", () => {
  it("lists every published gesture with its last update", async () => {
    const hond = await addGesture(db, { name: "Hond" });
    await addGesture(db, { name: "Kat", published: false });

    expect(
      await call(gesturesRouter.sitemap, undefined, { context: context() })
    ).toEqual([{ slug: "hond", updatedAt: hond.updatedAt.getTime() }]);
  });
});
