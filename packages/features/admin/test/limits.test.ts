import { env } from "cloudflare:workers";
import { call } from "@orpc/server";
import type { Category, Gesture } from "@smog/db";
import { createDb } from "@smog/db/client";
import { SPONSORSHIP_STATUSES } from "@smog/db/enums";
import { SAMPLE_PLAYBACK_ID } from "@smog/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_CATEGORIES_MAX,
  ADMIN_GESTURE_PAGE_MAX,
  ADMIN_SPONSORSHIPS_PAGE_MAX,
  BULK_UPDATE_MAX,
  GESTURE_CATEGORIES_MAX,
  GESTURE_KEYWORDS_MAX,
  SAVE_MANY_MAX,
  SPONSORSHIP_QUERY_MAX,
} from "../src/schema";
import { addCategory, addGesture } from "./catalog-helpers";
import { type Authed, contextAs, procedureAt, signedUp } from "./helpers";
import { seedCheckout } from "./sponsorship-helpers";

/*
 * D1 allows at most 100 bound parameters per statement, also inside a
 * batch (miniflare refuses more too, but only on the paths a test runs). Every catalogue procedure
 * runs here at its contract maximums over a D1 binding that records each
 * statement's bound parameters, and none may pass 100.
 */

const D1_MAX_PARAMS = 100;

interface Recorded {
  params: number;
  query: string;
}

/** A D1 binding that records the bound parameters of every statement. */
function recordingD1(d1: D1Database, into: Recorded[]): D1Database {
  return new Proxy(d1, {
    get(target, key) {
      if (key === "prepare") {
        return (query: string) => {
          const statement = target.prepare(query);
          return new Proxy(statement, {
            get(inner, innerKey) {
              if (innerKey === "bind") {
                return (...values: unknown[]) => {
                  into.push({ params: values.length, query });
                  return inner.bind(...values);
                };
              }
              const value: unknown = Reflect.get(inner, innerKey, inner);
              return typeof value === "function" ? value.bind(inner) : value;
            },
          });
        };
      }
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

let admin: Authed;
let categories: Category[];
let gestures: Gesture[];
const recorded: Recorded[] = [];

async function run<T = unknown>(path: string, input?: unknown): Promise<T> {
  const context = await contextAs(admin);
  return (await call(procedureAt(path), input, {
    context: { ...context, db: createDb(recordingD1(env.DB, recorded)) },
    path: ["admin", ...path.split(".")],
  })) as T;
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
const keywords = Array.from(
  { length: GESTURE_KEYWORDS_MAX },
  (_, i) => `trefwoord ${i}`
);

beforeAll(async () => {
  admin = await signedUp("admin");
  categories = await Promise.all(
    Array.from({ length: ADMIN_CATEGORIES_MAX }, (_, i) =>
      addCategory(`Limiet ${i}`, { sortOrder: i })
    )
  );
  const first = categories.slice(0, GESTURE_CATEGORIES_MAX);
  gestures = await Promise.all(
    Array.from({ length: BULK_UPDATE_MAX }, (_, i) =>
      addGesture({ categories: first, keywords, name: `Limietgebaar ${i}` })
    )
  );
  // Every gesture keeps a category outside the removed ones.
  const keep = categories[GESTURE_CATEGORIES_MAX] as Category;
  const link = env.DB.prepare(
    "INSERT INTO gesture_category (gesture_id, category_id) VALUES (?, ?)"
  );
  await env.DB.batch(gestures.map((row) => link.bind(row.id, keep.id)));
});

describe("D1's 100 bound parameters per statement", () => {
  it("holds for every catalogue procedure at its contract maximums", async () => {
    const twenty = ids(categories.slice(0, GESTURE_CATEGORIES_MAX));
    const later = ids(
      categories.slice(
        GESTURE_CATEGORIES_MAX + 1,
        GESTURE_CATEGORIES_MAX * 2 + 1
      )
    );

    await run("gestures.list", {
      category: twenty,
      limit: ADMIN_GESTURE_PAGE_MAX,
      q: "limiet",
    });
    await run("gestures.checkName", { name: "Limietgebaar 1" });
    const created = await run<{ id: string; updatedAt: number }>(
      "gestures.create",
      {
        categoryIds: twenty,
        description: "d".repeat(2000),
        keywords,
        name: "n".repeat(120),
        playbackId: SAMPLE_PLAYBACK_ID,
      }
    );
    await run("gestures.get", { id: created.id });
    await run("gestures.update", {
      categoryIds: later,
      description: "e".repeat(2000),
      expectedUpdatedAt: created.updatedAt,
      id: created.id,
      keywords: keywords.map((keyword) => `${keyword}!`),
      muxAssetId: "asset",
      name: "m".repeat(120),
      playbackId: SAMPLE_PLAYBACK_ID,
    });
    const rows = await run<{ items: { id: string; updatedAt: number }[] }>(
      "gestures.list",
      { limit: ADMIN_GESTURE_PAGE_MAX, q: "limietgebaar" }
    );
    // Each row gets 20 distinct categories: the save checks all 100 at once.
    await run("gestures.saveMany", {
      items: rows.items.slice(0, SAVE_MANY_MAX).map((row, i) => ({
        expectedUpdatedAt: row.updatedAt,
        id: row.id,
        patch: {
          categoryIds: ids(categories).slice(
            (i % 5) * 20,
            (i % 5) * 20 + GESTURE_CATEGORIES_MAX
          ),
          description: "f".repeat(2000),
          keywords,
          name: `Limietgebaar ${i} bewaard`,
        },
      })),
    });
    const all = ids(gestures);
    await run("gestures.bulkUpdate", {
      addCategoryIds: later,
      ids: all,
      published: false,
    });
    await run("gestures.bulkUpdate", {
      ids: all,
      published: true,
      removeCategoryIds: later,
    });
    await run("gestures.setPublished", { id: created.id, published: false });
    await run("gestures.delete", {
      confirmName: "m".repeat(120),
      id: created.id,
    });

    const list =
      await run<{ id: string; updatedAt: number }[]>("categories.list");
    expect(list).toHaveLength(ADMIN_CATEGORIES_MAX);
    await run("categories.reorder", { ids: ids(list).reverse() });
    const [one] = list;
    await run("categories.update", {
      expectedUpdatedAt: one?.updatedAt,
      id: one?.id,
      name: "Limiet hernoemd",
    });
    await run("categories.setPublished", { id: one?.id, published: false });

    const over = recorded.filter((entry) => entry.params > D1_MAX_PARAMS);
    expect(
      over.map((entry) => `${entry.params}: ${entry.query.slice(0, 120)}`)
    ).toEqual([]);
    expect(recorded.length).toBeGreaterThan(50);
  });

  it("holds for every sponsorship procedure at its maximums (every status, a 10 gesture payment)", async () => {
    recorded.length = 0;
    // A checkout holds at most 10 gestures: mark paid and cancel act on all.
    const toPay = await seedCheckout({ count: 10, logo: true });
    const toCancel = await seedCheckout({ count: 10 });
    const statuses = [...SPONSORSHIP_STATUSES];
    const page = await run<{
      items: { id: string }[];
      nextCursor: string | null;
    }>("sponsorships.list", {
      limit: ADMIN_SPONSORSHIPS_PAGE_MAX,
      status: statuses,
    });
    await run("sponsorships.list", {
      cursor: page.nextCursor ?? undefined,
      from: 0,
      limit: ADMIN_SPONSORSHIPS_PAGE_MAX,
      paymentId: toPay.paymentId,
      q: "q".repeat(SPONSORSHIP_QUERY_MAX),
      refundNeeded: true,
      status: statuses,
      to: Date.now(),
    });
    await run("sponsorships.get", { id: toPay.sponsorshipIds[0] });
    await run("sponsorships.markPaid", {
      note: "n".repeat(200),
      paymentId: toPay.paymentId,
    });
    await run("sponsorships.cancel", { paymentId: toCancel.paymentId });
    await run("sponsorships.get", { id: toPay.sponsorshipIds[0] });
    await run("export.sponsorshipsCsv", { status: statuses });
    await run("dashboard");

    const over = recorded.filter((entry) => entry.params > D1_MAX_PARAMS);
    expect(
      over.map((entry) => `${entry.params}: ${entry.query.slice(0, 120)}`)
    ).toEqual([]);
    expect(recorded.length).toBeGreaterThan(20);
  });

  it("caps the categories at 100: a 101st is INVALID_STATE, reorder takes them all", async () => {
    await expect(
      run("categories.create", { name: "Eén te veel" })
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    const unused = await addCategory("Ongebruikt over");
    const list = await run<{ id: string }[]>("categories.list");
    // 101 rows exist now (inserted around the procedure): the list and the
    // reorder input stop at 100, so the order cannot be the exact set.
    expect(list).toHaveLength(ADMIN_CATEGORIES_MAX);
    await run("categories.delete", { id: unused.id });
    await run("categories.reorder", { ids: ids(await run("categories.list")) });
  });
});
