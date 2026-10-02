import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { searchGestures } from "../../gestures/src/server/search";
import type { AdminCategory } from "../src/schema";
import {
  addCategory,
  addGesture,
  catalogVersion,
  ftsOutOfStep,
  ftsRows,
} from "./catalog-helpers";
import {
  type Authed,
  auditMark,
  auditRowsSince,
  callAs,
  expectAudit,
  signedUp,
  testDb,
} from "./helpers";

/*
 * `admin.categories.*` over the test D1: a rename or a publish change
 * rebuilds the FTS rows of every gesture in the category (their
 * `categories` column holds published category names), every write is
 * audited and bumps the catalog version, and reads come from D1.
 */

let admin: Authed;

beforeAll(async () => {
  admin = await signedUp("admin");
});

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

async function searchCategory(q: string): Promise<string[]> {
  const page = await searchGestures(
    { db: testDb(), kv: env.KV },
    { limit: 50, q }
  );
  return page.items.map((item) => item.id);
}

async function allCategoryIds(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM category ORDER BY id"
  ).all<{
    id: string;
  }>();
  return results.map((row) => row.id);
}

describe("admin.categories.create", () => {
  it("creates at the end of the order with a slug, audits it and bumps the version", async () => {
    const last = await addCategory("Laatste tot nu", { sortOrder: 40 });
    const before = await catalogVersion();
    const mark = await auditMark();
    const created = await callAs<AdminCategory>(admin, "categories.create", {
      name: "  Kleuren en Vormen ",
    });
    expect(created).toMatchObject({
      gestureCount: 0,
      name: "Kleuren en Vormen",
      publishedGestureCount: 0,
      slug: "kleuren-en-vormen",
      sortOrder: last.sortOrder + 1,
    });
    expect(created.publishedAt).not.toBeNull();
    await expectAudit("categories.create", {
      actorId: admin.user.id,
      data: {
        name: "Kleuren en Vormen",
        published: true,
        slug: "kleuren-en-vormen",
      },
      mark,
      targetId: created.id,
      targetType: "category",
    });
    expect(await catalogVersion()).not.toBe(before);
  });

  it("is CONFLICT duplicateName for a normalizeText-equal name", async () => {
    await callAs(admin, "categories.create", { name: "Dieren" });
    const mark = await auditMark();
    expect(
      await failure(callAs(admin, "categories.create", { name: " DIËREN " }))
    ).toMatchObject({ code: "CONFLICT", data: { reason: "duplicateName" } });
    expect(await auditRowsSince(mark)).toEqual([]);
  });

  it("gives a colliding slug a suffix, and creates unpublished when asked", async () => {
    const first = await callAs<AdminCategory>(admin, "categories.create", {
      name: "Eten & Drinken",
    });
    const second = await callAs<AdminCategory>(admin, "categories.create", {
      name: "Eten Drinken",
      published: false,
    });
    expect([first.slug, second.slug]).toEqual([
      "eten-drinken",
      "eten-drinken-2",
    ]);
    expect(second.publishedAt).toBeNull();
  });

  it("allows 60 characters, and refuses 61", async () => {
    const name = "c".repeat(60);
    expect(
      (await callAs<AdminCategory>(admin, "categories.create", { name })).name
    ).toBe(name);
    expect(
      (await failure(callAs(admin, "categories.create", { name: `${name}d` })))
        .code
    ).toBe("BAD_REQUEST");
  });
});

describe("admin.categories.update", () => {
  it("renames (the slug stays) and reindexes every gesture in the category", async () => {
    const renamed = await addCategory("Vervoer");
    const other = await addCategory("Ander");
    const a = await addGesture({ categories: [renamed], name: "Fiets" });
    const b = await addGesture({ categories: [renamed, other], name: "Auto" });
    const outside = await addGesture({ categories: [other], name: "Buiten" });
    expect(await searchCategory("vervoermiddelen")).not.toContain(a.id);
    const mark = await auditMark();

    const updated = await callAs<AdminCategory>(admin, "categories.update", {
      expectedUpdatedAt: renamed.updatedAt.getTime(),
      id: renamed.id,
      name: "Vervoermiddelen",
    });

    expect(updated).toMatchObject({
      gestureCount: 2,
      name: "Vervoermiddelen",
      slug: renamed.slug,
    });
    expect(await ftsOutOfStep([a.id, b.id, outside.id])).toEqual([]);
    expect((await ftsRows(a.id))[0]?.categories).toBe("Vervoermiddelen");
    expect(await searchCategory("vervoermiddelen")).toEqual(
      expect.arrayContaining([a.id, b.id])
    );
    expect(await searchCategory("vervoermiddelen")).not.toContain(outside.id);
    await expectAudit("categories.update", {
      actorId: admin.user.id,
      data: {
        name: "Vervoermiddelen",
        previousName: "Vervoer",
        slug: renamed.slug,
      },
      mark,
      targetId: renamed.id,
      targetType: "category",
    });
  });

  it("is CONFLICT stale for an old expectedUpdatedAt, duplicateName for a taken name", async () => {
    const row = await addCategory("Weer");
    await addCategory("Seizoenen");
    await callAs(admin, "categories.update", {
      expectedUpdatedAt: row.updatedAt.getTime(),
      id: row.id,
      name: "Het weer",
    });
    const mark = await auditMark();
    expect(
      await failure(
        callAs(admin, "categories.update", {
          expectedUpdatedAt: row.updatedAt.getTime(),
          id: row.id,
          name: "Weerbericht",
        })
      )
    ).toMatchObject({
      code: "CONFLICT",
      data: { ids: [row.id], reason: "stale" },
    });
    const [current] = await callAs<AdminCategory[]>(
      admin,
      "categories.list"
    ).then((list) => list.filter((item) => item.id === row.id));
    expect(current?.name).toBe("Het weer");
    expect(
      await failure(
        callAs(admin, "categories.update", {
          expectedUpdatedAt: current?.updatedAt,
          id: row.id,
          name: "seizoenen",
        })
      )
    ).toMatchObject({ code: "CONFLICT", data: { reason: "duplicateName" } });
    expect(await auditRowsSince(mark)).toEqual([]);
  });
});

describe("admin.categories.setPublished", () => {
  it("unpublishing drops the name from its gestures' FTS rows; publishing restores it", async () => {
    const category = await addCategory("Muziekinstrumenten");
    const row = await addGesture({ categories: [category], name: "Trommel" });
    let mark = await auditMark();
    const hidden = await callAs<AdminCategory>(
      admin,
      "categories.setPublished",
      {
        id: category.id,
        published: false,
      }
    );
    expect(hidden.publishedAt).toBeNull();
    expect((await ftsRows(row.id))[0]?.categories).toBe("");
    expect(await searchCategory("muziekinstrumenten")).not.toContain(row.id);
    await expectAudit("categories.setPublished", {
      action: "category.unpublish",
      actorId: admin.user.id,
      data: { name: "Muziekinstrumenten", slug: category.slug },
      mark,
      targetId: category.id,
      targetType: "category",
    });

    mark = await auditMark();
    await callAs(admin, "categories.setPublished", {
      id: category.id,
      published: true,
    });
    expect((await ftsRows(row.id))[0]?.categories).toBe("Muziekinstrumenten");
    expect(await searchCategory("muziekinstrumenten")).toContain(row.id);
    await expectAudit("categories.setPublished", {
      action: "category.publish",
      actorId: admin.user.id,
      mark,
      targetId: category.id,
      targetType: "category",
    });
  });

  it("is INVALID_STATE when it already is", async () => {
    const category = await addCategory();
    expect(
      (
        await failure(
          callAs(admin, "categories.setPublished", {
            id: category.id,
            published: true,
          })
        )
      ).code
    ).toBe("INVALID_STATE");
  });
});

describe("admin.categories.delete", () => {
  it("is CONFLICT inUse while a gesture has it, and deletes an unused one", async () => {
    const used = await addCategory("In gebruik");
    await addGesture({ categories: [used], published: false });
    const mark = await auditMark();
    expect(
      await failure(callAs(admin, "categories.delete", { id: used.id }))
    ).toMatchObject({
      code: "CONFLICT",
      data: { reason: "inUse" },
    });
    expect(await allCategoryIds()).toContain(used.id);
    expect(await auditRowsSince(mark)).toEqual([]);

    const unused = await addCategory("Ongebruikt");
    await callAs(admin, "categories.delete", { id: unused.id });
    expect(await allCategoryIds()).not.toContain(unused.id);
    await expectAudit("categories.delete", {
      actorId: admin.user.id,
      data: { name: "Ongebruikt", slug: unused.slug },
      mark,
      targetId: unused.id,
      targetType: "category",
    });
    expect(
      (await failure(callAs(admin, "categories.delete", { id: unused.id })))
        .code
    ).toBe("NOT_FOUND");
  });
});

describe("admin.categories.reorder", () => {
  it("needs exactly the current set, then sets sort_order 0..n-1", async () => {
    await addCategory("Volgorde a");
    const ids = await allCategoryIds();
    const reversed = [...ids].reverse();
    const mark = await auditMark();
    const refused = await Promise.all(
      [
        reversed.slice(1),
        [...reversed, "unknown"],
        [...reversed.slice(1), reversed[1]],
      ].map(
        async (wrong) =>
          (await failure(callAs(admin, "categories.reorder", { ids: wrong })))
            .code
      )
    );
    expect(refused).toEqual([
      "INVALID_STATE",
      "INVALID_STATE",
      "INVALID_STATE",
    ]);
    expect(await auditRowsSince(mark)).toEqual([]);

    const list = await callAs<AdminCategory[]>(admin, "categories.reorder", {
      ids: reversed,
    });
    expect(list.map((item) => [item.id, item.sortOrder])).toEqual(
      reversed.map((id, index) => [id, index])
    );
    await expectAudit("categories.reorder", {
      actorId: admin.user.id,
      data: { ids: reversed },
      mark,
      targetId: null,
      targetType: "category",
    });
  });
});

describe("admin.categories.list", () => {
  it("reads every category from D1, published or not, with both counts", async () => {
    const hidden = await addCategory("Verstopt", { published: false });
    await addGesture({ categories: [hidden] });
    await addGesture({ categories: [hidden], published: false });
    const list = await callAs<AdminCategory[]>(admin, "categories.list");
    expect(list.find((item) => item.id === hidden.id)).toMatchObject({
      gestureCount: 2,
      name: "Verstopt",
      publishedAt: null,
      publishedGestureCount: 1,
    });
    expect(list.map((item) => item.sortOrder)).toEqual(
      [...list.map((item) => item.sortOrder)].sort((x, y) => x - y)
    );
  });
});
