import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import { gesture, gestureSortName } from "@smog/db";
import { SAMPLE_PLAYBACK_ID } from "@smog/db/testing";
import { sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { searchGestures } from "../../gestures/src/server/search";
import type { AdminGestureDetail, AdminGesturePage } from "../src/schema";
import { createAdminRouter } from "../src/server";
import {
  failWhen,
  GuardFailedError,
  runCatalogBatch,
} from "../src/server/catalog-writes";
import { adminGesturesQuery } from "../src/server/gestures";
import {
  addCategory,
  addGesture,
  addSponsorship,
  catalogVersion,
  categoryIdsOf,
  ftsOutOfStep,
  ftsRows,
  storedGesture,
} from "./catalog-helpers";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  contextAs,
  expectAudit,
  signedUp,
  testDb,
} from "./helpers";

/*
 * `admin.gestures.*` over the test D1 (ruling 8, the catalogue carries):
 * every write sets `sort_name`, rebuilds the FTS row and writes its audit
 * entry in one batch, then bumps the catalog version; reads come from D1.
 */

/** The slug of a name without letters or digits. */
const FALLBACK_SLUG = /^gesture(-\d+)?$/;

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The error of a rejected call (fails when it resolved). */
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

async function search(q: string): Promise<string[]> {
  const page = await searchGestures(
    { db: testDb(), kv: env.KV },
    { limit: 50, q }
  );
  return page.items.map((item) => item.id);
}

function create(input: Record<string, unknown>) {
  return callAs<AdminGestureDetail>(admin, "gestures.create", {
    playbackId: SAMPLE_PLAYBACK_ID,
    ...input,
  });
}

describe("admin.gestures.create", () => {
  it("sets the slug, sort_name, the FTS row and one audit entry, and bumps the version", async () => {
    const shown = await addCategory("Begroetingen");
    const hidden = await addCategory("Verborgen groep", { published: false });
    const before = await catalogVersion();
    const mark = await auditMark();

    const created = await create({
      categoryIds: [shown.id, hidden.id],
      description: "  Zwaai met je hand.  ",
      keywords: ["hallo", "dag"],
      name: "  Één Zwaai  ",
    });

    expect(created).toMatchObject({
      description: "Zwaai met je hand.",
      keywords: ["hallo", "dag"],
      name: "Één Zwaai",
      slug: "een-zwaai",
    });
    expect(created.publishedAt).not.toBeNull();
    expect(
      created.categories.map((item) => [item.name, item.published])
    ).toEqual([
      ["Begroetingen", true],
      ["Verborgen groep", false],
    ]);
    expect((await storedGesture(created.id))?.sort_name).toBe(
      gestureSortName("Één Zwaai")
    );
    expect(await ftsOutOfStep([created.id])).toEqual([]);
    expect((await ftsRows(created.id))[0]?.categories).toBe("Begroetingen");
    expect(await search("een zwaai")).toContain(created.id);
    expect(await search("hallo")).toContain(created.id);
    await expectAudit("gestures.create", {
      actorId: admin.user.id,
      data: { name: "Één Zwaai", published: true, slug: "een-zwaai" },
      mark,
      targetId: created.id,
      targetType: "gesture",
    });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("creates unpublished when asked, and gives colliding slugs suffixes", async () => {
    const category = await addCategory();
    const first = await create({ categoryIds: [category.id], name: "Botsing" });
    const second = await create({
      categoryIds: [category.id],
      name: "botsing!",
    });
    const third = await create({
      categoryIds: [category.id],
      name: "Bötsing",
      published: false,
    });
    const symbols = await create({ categoryIds: [category.id], name: "!!!" });
    expect([first.slug, second.slug, third.slug]).toEqual([
      "botsing",
      "botsing-2",
      "botsing-3",
    ]);
    expect(third.publishedAt).toBeNull();
    expect(symbols.slug).toMatch(FALLBACK_SLUG);
  });

  it("de-duplicates keywords by normalizeText, keeping the first spelling and the order", async () => {
    const category = await addCategory();
    const created = await create({
      categoryIds: [category.id],
      keywords: ["Café", " koffie ", "cafe", "CAFÉ", "Koffie", "thee"],
      name: "Koffie drinken",
    });
    expect(created.keywords).toEqual(["Café", "koffie", "thee"]);
  });

  it("allows 120 characters after trimming, and refuses 121", async () => {
    const category = await addCategory();
    const long = "a".repeat(120);
    const created = await create({
      categoryIds: [category.id],
      name: `  ${long}  `,
    });
    expect(created.name).toBe(long);
    const refused = await failure(
      create({ categoryIds: [category.id], name: `${long}b` })
    );
    expect(refused.code).toBe("BAD_REQUEST");
    const empty = await failure(
      create({ categoryIds: [category.id], name: "   " })
    );
    expect(empty.code).toBe("BAD_REQUEST");
  });

  it("refuses unknown categories, and a gesture without any", async () => {
    expect(
      (await failure(create({ categoryIds: ["nope"], name: "Zonder" }))).code
    ).toBe("VALIDATION");
    expect(
      (await failure(create({ categoryIds: [], name: "Zonder" }))).code
    ).toBe("BAD_REQUEST");
  });

  it("still succeeds when the version bump fails, and logs it", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const router = createAdminRouter({
      bumpCatalogVersion: () => Promise.reject(new Error("KV is down")),
    });
    const category = await addCategory();
    const created = (await call(
      router.gestures.create,
      {
        categoryIds: [category.id],
        name: "KV weg",
        playbackId: SAMPLE_PLAYBACK_ID,
      },
      { context: await contextAs(admin), path: ["admin", "gestures", "create"] }
    )) as AdminGestureDetail;
    expect(created.name).toBe("KV weg");
    expect(await storedGesture(created.id)).not.toBeNull();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining(
        "[admin] Failed to bump the catalog version after a gesture create"
      ),
      expect.any(Error)
    );
  });
});

describe("admin.gestures.update", () => {
  it("renames: keeps the slug, sets sort_name, reindexes and audits the change", async () => {
    const row = await addGesture({ keywords: ["oud"], name: "Oude naam" });
    const before = await catalogVersion();
    const mark = await auditMark();
    const updated = await callAs<AdminGestureDetail>(admin, "gestures.update", {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      keywords: ["nieuw"],
      name: "Ände Nieuwe",
    });
    expect(updated).toMatchObject({
      keywords: ["nieuw"],
      name: "Ände Nieuwe",
      slug: row.slug,
    });
    expect(updated.updatedAt).toBeGreaterThan(row.updatedAt.getTime());
    expect((await storedGesture(row.id))?.sort_name).toBe("ande nieuwe");
    expect(await ftsOutOfStep([row.id])).toEqual([]);
    expect(await search("ande nieuwe")).toContain(row.id);
    expect(await search("oude naam")).not.toContain(row.id);
    await expectAudit("gestures.update", {
      actorId: admin.user.id,
      data: {
        fields: ["keywords", "name"],
        name: "Ände Nieuwe",
        previousName: "Oude naam",
        slug: row.slug,
      },
      mark,
      targetId: row.id,
      targetType: "gesture",
    });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("is CONFLICT stale for an old expectedUpdatedAt, and writes nothing", async () => {
    const row = await addGesture({ name: "Twee editors" });
    await callAs(admin, "gestures.update", {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      name: "Eerste save",
    });
    const mark = await auditMark();
    const stale = await failure(
      callAs(admin, "gestures.update", {
        expectedUpdatedAt: row.updatedAt.getTime(),
        id: row.id,
        name: "Tweede save",
      })
    );
    expect(stale).toMatchObject({
      code: "CONFLICT",
      data: { ids: [row.id], reason: "stale" },
    });
    expect((await storedGesture(row.id))?.name).toBe("Eerste save");
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("is VALIDATION for an empty patch, NOT_FOUND for an unknown id", async () => {
    const row = await addGesture();
    expect(
      (
        await failure(
          callAs(admin, "gestures.update", {
            expectedUpdatedAt: row.updatedAt.getTime(),
            id: row.id,
          })
        )
      ).code
    ).toBe("VALIDATION");
    expect(
      (
        await failure(
          callAs(admin, "gestures.update", {
            expectedUpdatedAt: 1,
            id: "unknown",
            name: "X",
          })
        )
      ).code
    ).toBe("NOT_FOUND");
  });

  it("replaces the categories, and clears the asset id with null", async () => {
    const [a, b] = [await addCategory(), await addCategory()];
    const row = await addGesture({ categories: [a] });
    const updated = await callAs<AdminGestureDetail>(admin, "gestures.update", {
      categoryIds: [b.id],
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      muxAssetId: null,
    });
    expect(updated.categories.map((item) => item.id)).toEqual([b.id]);
    expect(updated.muxAssetId).toBeNull();
    expect(await ftsOutOfStep([row.id])).toEqual([]);
  });
});

describe("admin.gestures.saveMany", () => {
  it("saves every row in one batch, with one audit entry per gesture", async () => {
    const one = await addGesture({ name: "Rij een" });
    const two = await addGesture({ name: "Rij twee" });
    const mark = await auditMark();
    const saved = await callAs<{ items: { id: string; name: string }[] }>(
      admin,
      "gestures.saveMany",
      {
        items: [
          {
            expectedUpdatedAt: one.updatedAt.getTime(),
            id: one.id,
            patch: { name: "Rij één" },
          },
          {
            expectedUpdatedAt: two.updatedAt.getTime(),
            id: two.id,
            patch: { description: "Nieuwe uitleg" },
          },
        ],
      }
    );
    expect(saved.items.map((item) => [item.id, item.name])).toEqual([
      [one.id, "Rij één"],
      [two.id, "Rij twee"],
    ]);
    // The table editor's rows carry the description (it edits it inline).
    expect(
      (saved.items as { description?: string }[]).map(
        (item) => item.description
      )
    ).toEqual(["", "Nieuwe uitleg"]);
    expect(await ftsOutOfStep([one.id, two.id])).toEqual([]);
    await expectAudit("gestures.saveMany", {
      actorId: admin.user.id,
      mark,
      targetId: one.id,
      targetType: "gesture",
    });
    await expectAudit("gestures.saveMany", {
      actorId: admin.user.id,
      data: { fields: ["description"], name: "Rij twee", slug: two.slug },
      mark,
      targetId: two.id,
      targetType: "gesture",
    });
  });

  it("is all or nothing: one stale row is CONFLICT with its id, and nothing is written", async () => {
    const fresh = await addGesture({ name: "Vers" });
    const old = await addGesture({ name: "Oud" });
    await env.DB.prepare(
      "UPDATE gesture SET updated_at = updated_at + 5 WHERE id = ?"
    )
      .bind(old.id)
      .run();
    const mark = await auditMark();
    const stale = await failure(
      callAs(admin, "gestures.saveMany", {
        items: [
          {
            expectedUpdatedAt: fresh.updatedAt.getTime(),
            id: fresh.id,
            patch: { name: "Vervangen" },
          },
          {
            expectedUpdatedAt: old.updatedAt.getTime(),
            id: old.id,
            patch: { name: "Oud 2" },
          },
        ],
      })
    );
    expect(stale).toMatchObject({
      code: "CONFLICT",
      data: { ids: [old.id], reason: "stale" },
    });
    expect((await storedGesture(fresh.id))?.name).toBe("Vers");
    expect(await search("vervangen")).not.toContain(fresh.id);
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("refuses the same gesture twice", async () => {
    const row = await addGesture();
    const item = {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      patch: { name: "X" },
    };
    expect(
      (
        await failure(
          callAs(admin, "gestures.saveMany", { items: [item, item] })
        )
      ).code
    ).toBe("BAD_REQUEST");
  });
});

describe("the in-batch guards", () => {
  it("roll back the statements before them and name the guard", async () => {
    const row = await addGesture({ name: "Terugdraaien" });
    const db = testDb();
    const run = runCatalogBatch(
      db,
      [
        db
          .update(gesture)
          .set({ name: "Half geschreven" })
          .where(sql`${gesture.id} = ${row.id}`),
        failWhen(db, "stale", sql`1 = 1`),
      ],
      "test the guard"
    );
    await expect(run).rejects.toBeInstanceOf(GuardFailedError);
    await expect(run).rejects.toMatchObject({ guard: "stale" });
    expect((await storedGesture(row.id))?.name).toBe("Terugdraaien");
  });

  it("let the batch through when the condition does not hold", async () => {
    const row = await addGesture({ name: "Doorlaten" });
    const db = testDb();
    await runCatalogBatch(
      db,
      [
        failWhen(db, "stale", sql`1 = 0`),
        db
          .update(gesture)
          .set({ name: "Doorgelaten" })
          .where(sql`${gesture.id} = ${row.id}`),
      ],
      "test the guard"
    );
    expect((await storedGesture(row.id))?.name).toBe("Doorgelaten");
  });
});

describe("admin.gestures.setPublished", () => {
  it("unpublishes and publishes, with gesture.unpublish / gesture.publish", async () => {
    const row = await addGesture({ name: "Aan en uit" });
    let mark = await auditMark();
    const hidden = await callAs<AdminGestureDetail>(
      admin,
      "gestures.setPublished",
      {
        id: row.id,
        published: false,
      }
    );
    expect(hidden.publishedAt).toBeNull();
    expect(await search("aan en uit")).not.toContain(row.id);
    await expectAudit("gestures.setPublished", {
      action: "gesture.unpublish",
      actorId: admin.user.id,
      data: { name: row.name, slug: row.slug },
      mark,
      targetId: row.id,
      targetType: "gesture",
    });
    mark = await auditMark();
    const shown = await callAs<AdminGestureDetail>(
      admin,
      "gestures.setPublished",
      {
        id: row.id,
        published: true,
      }
    );
    expect(shown.publishedAt).not.toBeNull();
    expect(await search("aan en uit")).toContain(row.id);
    await expectAudit("gestures.setPublished", {
      action: "gesture.publish",
      actorId: admin.user.id,
      mark,
      targetId: row.id,
      targetType: "gesture",
    });
  });

  it("is INVALID_STATE when it already is, and audits nothing", async () => {
    const row = await addGesture();
    const mark = await auditMark();
    expect(
      (
        await failure(
          callAs(admin, "gestures.setPublished", {
            id: row.id,
            published: true,
          })
        )
      ).code
    ).toBe("INVALID_STATE");
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});

describe("admin.gestures.bulkUpdate", () => {
  it("unpublishes and moves categories in one batch, with one bulk entry", async () => {
    const [from, to] = [await addCategory("Van"), await addCategory("Naar")];
    const one = await addGesture({ categories: [from] });
    const two = await addGesture({ categories: [from, to] });
    const mark = await auditMark();
    const result = await callAs(admin, "gestures.bulkUpdate", {
      addCategoryIds: [to.id],
      ids: [one.id, two.id, one.id],
      published: false,
      removeCategoryIds: [from.id],
    });
    expect(result).toEqual({ updated: 2 });
    const after = await Promise.all(
      [one, two].map(async (row) => ({
        categories: await categoryIdsOf(row.id),
        fts: (await ftsRows(row.id))[0]?.categories,
        publishedAt: (await storedGesture(row.id))?.published_at,
      }))
    );
    expect(after).toEqual([
      { categories: [to.id], fts: "Naar", publishedAt: null },
      { categories: [to.id], fts: "Naar", publishedAt: null },
    ]);
    expect(await ftsOutOfStep([one.id, two.id])).toEqual([]);
    await expectAudit("gestures.bulkUpdate", {
      actorId: admin.user.id,
      data: {
        ids: [one.id, two.id],
        patch: {
          addCategoryIds: [to.id],
          published: false,
          removeCategoryIds: [from.id],
        },
      },
      mark,
      targetId: null,
      targetType: "gesture",
    });
  });

  it("keeps the first published date when publishing a published gesture", async () => {
    const row = await addGesture();
    const before = (await storedGesture(row.id))?.published_at;
    await callAs(admin, "gestures.bulkUpdate", {
      ids: [row.id],
      published: true,
    });
    expect((await storedGesture(row.id))?.published_at).toBe(before);
  });

  it("is INVALID_STATE when a gesture would be left without a category, and writes nothing", async () => {
    const only = await addCategory();
    const other = await addCategory();
    const bare = await addGesture({ categories: [only] });
    const fine = await addGesture({ categories: [only, other] });
    const mark = await auditMark();
    expect(
      (
        await failure(
          callAs(admin, "gestures.bulkUpdate", {
            ids: [fine.id, bare.id],
            published: false,
            removeCategoryIds: [only.id],
          })
        )
      ).code
    ).toBe("INVALID_STATE");
    expect(await categoryIdsOf(bare.id)).toEqual([only.id]);
    expect(await categoryIdsOf(fine.id)).toEqual([only.id, other.id].sort());
    expect((await storedGesture(fine.id))?.published_at).not.toBeNull();
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("refuses an empty patch, a category added and removed, and unknown ids", async () => {
    const row = await addGesture();
    const category = await addCategory();
    expect(
      (await failure(callAs(admin, "gestures.bulkUpdate", { ids: [row.id] })))
        .code
    ).toBe("VALIDATION");
    expect(
      (
        await failure(
          callAs(admin, "gestures.bulkUpdate", {
            addCategoryIds: [category.id],
            ids: [row.id],
            removeCategoryIds: [category.id],
          })
        )
      ).code
    ).toBe("VALIDATION");
    expect(
      (
        await failure(
          callAs(admin, "gestures.bulkUpdate", {
            ids: ["unknown"],
            published: true,
          })
        )
      ).code
    ).toBe("NOT_FOUND");
  });
});

describe("admin.gestures.delete", () => {
  it("refuses a published or sponsored gesture, and a wrong confirmation", async () => {
    const published = await addGesture({ name: "Nog zichtbaar" });
    expect(
      await failure(
        callAs(admin, "gestures.delete", {
          confirmName: published.name,
          id: published.id,
        })
      )
    ).toMatchObject({ code: "CONFLICT", data: { reason: "published" } });

    const sponsored = await addGesture({
      name: "Gesponsord",
      published: false,
    });
    await addSponsorship(sponsored.id);
    expect(
      await failure(
        callAs(admin, "gestures.delete", {
          confirmName: sponsored.name,
          id: sponsored.id,
        })
      )
    ).toMatchObject({ code: "CONFLICT", data: { reason: "sponsored" } });

    const hidden = await addGesture({ name: "Verborgen", published: false });
    expect(
      (
        await failure(
          callAs(admin, "gestures.delete", {
            confirmName: "verborgen",
            id: hidden.id,
          })
        )
      ).code
    ).toBe("VALIDATION");
    expect(await storedGesture(hidden.id)).not.toBeNull();
  });

  it("deletes an unpublished gesture, its FTS row, and audits its name and slug", async () => {
    const row = await addGesture({ name: "Weg ermee", published: false });
    const mark = await auditMark();
    await callAs(admin, "gestures.delete", {
      confirmName: "Weg ermee",
      id: row.id,
    });
    expect(await storedGesture(row.id)).toBeNull();
    expect(await ftsRows(row.id)).toEqual([]);
    await expectAudit("gestures.delete", {
      actorId: admin.user.id,
      data: { name: "Weg ermee", slug: row.slug },
      mark,
      targetId: row.id,
      targetType: "gesture",
    });
  });
});

describe("admin.gestures reads", () => {
  it("get returns unpublished gestures, NOT_FOUND for unknown ones", async () => {
    const row = await addGesture({ name: "Nog niet klaar", published: false });
    const found = await callAs<AdminGestureDetail>(admin, "gestures.get", {
      id: row.id,
    });
    expect(found).toMatchObject({
      id: row.id,
      name: "Nog niet klaar",
      publishedAt: null,
    });
    expect(
      (await failure(callAs(admin, "gestures.get", { id: "unknown" }))).code
    ).toBe("NOT_FOUND");
  });

  it("checkName finds normalizeText-equal names, except the excluded one", async () => {
    const row = await addGesture({ name: "Dubbel Gebaar" });
    const result = await callAs<{ duplicates: { id: string }[] }>(
      admin,
      "gestures.checkName",
      {
        name: "  dubbel gebäar ",
      }
    );
    expect(result.duplicates.map((item) => item.id)).toContain(row.id);
    const excluded = await callAs<{ duplicates: { id: string }[] }>(
      admin,
      "gestures.checkName",
      { excludeId: row.id, name: "Dubbel Gebaar" }
    );
    expect(excluded.duplicates.map((item) => item.id)).not.toContain(row.id);
  });

  it("list reads unpublished rows, filters by status, q and category, and pages", async () => {
    const tag = `lijst${Date.now()}`;
    const category = await addCategory(`Lijst ${tag}`);
    const a = await addGesture({ categories: [category], name: `${tag} a` });
    const b = await addGesture({
      categories: [category],
      name: `${tag} b`,
      published: false,
    });
    const c = await addGesture({
      categories: [category],
      keywords: [`Crème ${tag}`],
      name: "Zonder tag",
    });
    const list = (input: Record<string, unknown>) =>
      callAs<AdminGesturePage>(admin, "gestures.list", input);

    const all = await list({ category: [category.id] });
    expect(all.items.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    expect(all.counts).toEqual({ published: 2, total: 3, unpublished: 1 });
    expect(all.items.map((item) => typeof item.description)).toEqual([
      "string",
      "string",
      "string",
    ]);

    const hidden = await list({
      category: [category.id],
      status: "unpublished",
    });
    expect(hidden.items.map((item) => item.id)).toEqual([b.id]);
    expect(hidden.counts.total).toBe(3);

    // `q` matches the name, or a keyword without its accents.
    const byName = await list({ q: tag.toUpperCase() });
    expect(byName.items.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    const byKeyword = await list({ q: `creme ${tag}` });
    expect(byKeyword.items.map((item) => item.id)).toEqual([c.id]);

    const first = await list({ category: [category.id], limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual([a.id, b.id]);
    expect(first.nextCursor).not.toBeNull();
    const second = await list({
      category: [category.id],
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map((item) => item.id)).toEqual([c.id]);
    expect(second.nextCursor).toBeNull();

    expect((await failure(list({ cursor: "not-a-cursor" }))).code).toBe(
      "VALIDATION"
    );
  });

  it("list plans: the status and q filters keep the index order, a category reads its members", async () => {
    const db = testDb();
    const shapes = [
      { filters: undefined, status: "published" as const },
      { filters: undefined, status: "unpublished" as const },
      {
        filters: sql`${gesture.id} IN (SELECT gc.gesture_id FROM gesture_category AS gc WHERE gc.category_id IN (SELECT value FROM json_each(${'["a"]'})))`,
        status: "all" as const,
      },
      {
        filters: sql`(instr(${gesture.sortName}, ${"x"}) > 0 OR ${gesture.id} IN (SELECT value FROM json_each(${'["a"]'})))`,
        status: "unpublished" as const,
      },
    ];
    const plans = await Promise.all(
      shapes.flatMap(({ filters, status }) =>
        [null, { id: "x", sortName: "m" }].map(async (position) => {
          const query = adminGesturesQuery(
            db,
            filters,
            status,
            position,
            50
          ).toSQL();
          const { results } = await env.DB.prepare(
            `EXPLAIN QUERY PLAN ${query.sql}`
          )
            .bind(...query.params)
            .all<{ detail: string; parent: number }>();
          return results
            .filter(
              (row) => row.parent === 0 && !row.detail.startsWith("CORRELATED")
            )
            .map((row) => row.detail)
            .join(" | ");
        })
      )
    );
    // Status and q keep the index order (q filters while it scans). A
    // category filter reads only its members by primary key and sorts them:
    // a category holds a small part of the catalogue.
    const ordered = (index: string) => [
      `SCAN gesture USING INDEX ${index}`,
      `SEARCH gesture USING INDEX ${index} (sort_name>?)`,
    ];
    const members =
      "SEARCH gesture USING INDEX sqlite_autoindex_gesture_1 (id=?) | LIST SUBQUERY 6 | USE TEMP B-TREE FOR ORDER BY";
    expect(plans).toEqual([
      ...ordered("gesture_published_sort_name_idx"),
      ...ordered("gesture_sort_name_idx"),
      members,
      members,
      ...ordered("gesture_sort_name_idx").map(
        (plan) => `${plan} | LIST SUBQUERY 5`
      ),
    ]);
  });

  it("list seeks the full (sort_name, id) index of migration 0006", async () => {
    const db = testDb();
    const plans = await Promise.all(
      [null, { id: "x", sortName: "m" }].map(async (position) => {
        const query = adminGesturesQuery(
          db,
          undefined,
          "all",
          position,
          50
        ).toSQL();
        const { results } = await env.DB.prepare(
          `EXPLAIN QUERY PLAN ${query.sql}`
        )
          .bind(...query.params)
          .all<{ detail: string; parent: number }>();
        // The outer query's steps (the correlated subqueries sort their own rows).
        return results
          .filter(
            (row) => row.parent === 0 && !row.detail.startsWith("CORRELATED")
          )
          .map((row) => row.detail);
      })
    );
    expect(plans).toEqual([
      ["SCAN gesture USING INDEX gesture_sort_name_idx"],
      ["SEARCH gesture USING INDEX gesture_sort_name_idx (sort_name>?)"],
    ]);
  });
});
