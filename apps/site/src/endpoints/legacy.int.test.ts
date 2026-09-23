// @vitest-environment node
import { getPayload, handleEndpoints } from "payload";
import { beforeAll, describe, expect, it } from "vitest";
import config from "../payload.config";

/*
 * Every fixture carries this, because the local D1 under
 * `.wrangler/state/vitest` is never cleared between runs: `legacyId` is
 * unique, so a fixed value would collide with the row the previous run left
 * behind, and the collision throws inside `beforeAll`, which Vitest reports
 * as *skipped* rather than failed.
 */
const RUN = crypto.randomUUID();

const SITE = "http://localhost:3003";

/**
 * `GET /api/legacy/gestures/:id` — the path `next.config.ts` rewrites
 * `/gestures/:id` to (`lib/legacyRedirects.test.ts` pins the rewrite) —
 * driven through `handleEndpoints` against a real database, so the mounted
 * path and the route parameter are exercised along with the lookup.
 */
describe("GET /api/legacy/gestures/:id", () => {
  let activeId: number;
  let inactiveId: number;
  let plainId: number;
  let numericLegacyId: string;
  let numericLegacyGestureId: number;

  const get = async (id: string, query = "", method = "GET") => {
    const response = await handleEndpoints({
      config,
      request: new Request(
        `${SITE}/api/legacy/gestures/${encodeURIComponent(id)}${query}`,
        { method }
      ),
    });

    return {
      cache: response.headers.get("cache-control"),
      location: response.headers.get("location"),
      status: response.status,
    };
  };

  beforeAll(async () => {
    const payload = await getPayload({ config });

    const category = await payload.create({
      collection: "categories",
      data: { isActive: true, name: `Legacy ${RUN}` },
      locale: "nl",
    });

    const gesture = async (data: { isActive: boolean; legacyId?: string }) =>
      (
        await payload.create({
          collection: "gestures",
          data: {
            categories: [category.id],
            name: `Legacy ${RUN} ${data.legacyId ?? "none"}`,
            playbackId: `pb-legacy-${RUN}-${data.legacyId ?? "none"}`,
            ...data,
          },
          locale: "nl",
        })
      ).id;

    // Fifteen digits: all-numeric like a primary key, but far beyond any id
    // the local database will ever reach, so only the `legacyId` can match.
    numericLegacyId = `${Date.now()}${Math.floor(Math.random() * 90) + 10}`;

    activeId = await gesture({ isActive: true, legacyId: `active-${RUN}` });
    inactiveId = await gesture({ isActive: false, legacyId: `hidden-${RUN}` });
    plainId = await gesture({ isActive: true });
    numericLegacyGestureId = await gesture({
      isActive: true,
      legacyId: numericLegacyId,
    });
  });

  it("boots with the fixtures this file assumes", () => {
    expect(activeId).toBeGreaterThan(0);
    expect(inactiveId).toBeGreaterThan(0);
    expect(plainId).toBeGreaterThan(0);
    expect(numericLegacyGestureId).toBeGreaterThan(0);
    expect(numericLegacyId).toMatch(/^\d{15}$/);
  });

  it("sends an old id to the gesture it was imported as", async () => {
    expect(await get(`active-${RUN}`)).toEqual({
      cache: "public, max-age=86400",
      location: `/nl/gestures/${activeId}`,
      status: 308,
    });
  });

  it("sends a numeric id that is an active gesture to that gesture", async () => {
    expect(await get(String(plainId))).toEqual({
      cache: "public, max-age=86400",
      location: `/nl/gestures/${plainId}`,
      status: 308,
    });
  });

  it("tries a numeric id as an old id when no gesture has it as its own", async () => {
    expect((await get(numericLegacyId)).location).toBe(
      `/nl/gestures/${numericLegacyGestureId}`
    );
  });

  it("answers a HEAD the same way, for link checkers", async () => {
    expect(await get(`active-${RUN}`, "", "HEAD")).toEqual({
      cache: "public, max-age=86400",
      location: `/nl/gestures/${activeId}`,
      status: 308,
    });
  });

  it("keeps the query string", async () => {
    expect((await get(`active-${RUN}`, "?ref=qr&x=1")).location).toBe(
      `/nl/gestures/${activeId}?ref=qr&x=1`
    );
    expect(await get(`unknown-${RUN}`, "?ref=qr")).toEqual({
      cache: "no-store",
      location: "/nl/gestures?ref=qr",
      status: 307,
    });
  });

  it.each([
    ["an unknown old id", () => `unknown-${RUN}`],
    ["an inactive gesture's old id", () => `hidden-${RUN}`],
    ["an inactive gesture's own id", () => String(inactiveId)],
    ["a numeric id nothing has", () => "999999999999999"],
    ["an id no gesture URL was ever built with", () => "not an id!"],
    ["an absurdly long id", () => "a".repeat(500)],
  ])("sends %s to the list, temporarily and uncached", async (_label, id) => {
    // A 307, not a 308: an inactive gesture may be published later, and a
    // permanent redirect would be cached as the old URL's answer for good.
    expect(await get(id())).toEqual({
      cache: "no-store",
      location: "/nl/gestures",
      status: 307,
    });
  });

  it("answers a HEAD for an unknown id the same way", async () => {
    expect(await get(`unknown-${RUN}`, "", "HEAD")).toEqual({
      cache: "no-store",
      location: "/nl/gestures",
      status: 307,
    });
  });
});

/**
 * `GET /api/legacy/gestures` — the path `next.config.ts` rewrites the old
 * list, `/gestures`, to — against a real database, for the same reasons as
 * the gesture redirect above.
 */
describe("GET /api/legacy/gestures", () => {
  let legacyCategoryId: number;
  let plainCategoryId: number;
  let inactiveCategoryId: number;
  let numericLegacyCategoryId: number;
  let numericCategoryLegacyId: string;

  const get = async (query = "", method = "GET") => {
    const response = await handleEndpoints({
      config,
      request: new Request(`${SITE}/api/legacy/gestures${query}`, { method }),
    });

    return {
      cache: response.headers.get("cache-control"),
      location: response.headers.get("location"),
      status: response.status,
    };
  };

  const permanent = (location: string) => ({
    cache: "public, max-age=86400",
    location,
    status: 308,
  });

  const temporary = (location: string) => ({
    cache: "no-store",
    location,
    status: 307,
  });

  beforeAll(async () => {
    const payload = await getPayload({ config });

    const category = async (data: { isActive: boolean; legacyId?: string }) =>
      (
        await payload.create({
          collection: "categories",
          data: { name: `List ${RUN} ${data.legacyId ?? "none"}`, ...data },
          locale: "nl",
        })
      ).id;

    legacyCategoryId = await category({
      isActive: true,
      legacyId: `cat-${RUN}`,
    });
    plainCategoryId = await category({ isActive: true });
    inactiveCategoryId = await category({
      isActive: false,
      legacyId: `cat-hidden-${RUN}`,
    });
    // All digits, like a primary key, but far beyond any the local database
    // will reach, so only the `legacyId` can match.
    numericCategoryLegacyId = `${Date.now()}${Math.floor(Math.random() * 90) + 10}`;
    numericLegacyCategoryId = await category({
      isActive: true,
      legacyId: numericCategoryLegacyId,
    });
  });

  it("boots with the fixtures this file assumes", () => {
    expect(legacyCategoryId).toBeGreaterThan(0);
    expect(plainCategoryId).toBeGreaterThan(0);
    expect(inactiveCategoryId).toBeGreaterThan(0);
    expect(numericLegacyCategoryId).toBeGreaterThan(0);
  });

  it("tries a numeric value as an old id when no category has it as its own", async () => {
    expect(await get(`?category=${numericCategoryLegacyId}`)).toEqual(
      permanent(`/nl/gestures?category=${numericLegacyCategoryId}`)
    );
  });

  it("sends the bare list to the list", async () => {
    expect(await get()).toEqual(permanent("/nl/gestures"));
  });

  it("keeps a search, and anything else, as it came", async () => {
    expect(await get("?q=hallo&page=2&ref=qr")).toEqual(
      permanent("/nl/gestures?q=hallo&page=2&ref=qr")
    );
  });

  it("translates an old category id into the imported category's id", async () => {
    expect(await get(`?category=cat-${RUN}`)).toEqual(
      permanent(`/nl/gestures?category=${legacyCategoryId}`)
    );
  });

  it("keeps a numeric id that is an active category", async () => {
    expect(await get(`?category=${plainCategoryId}`)).toEqual(
      permanent(`/nl/gestures?category=${plainCategoryId}`)
    );
  });

  it.each([
    ["an unknown old id", () => `unknown-${RUN}`],
    ["an inactive category's old id", () => `cat-hidden-${RUN}`],
    ["an inactive category's own id", () => String(inactiveCategoryId)],
    ["a numeric id nothing has", () => "999999999999999"],
    ["a value no filter link was ever built with", () => "not a category!"],
  ])("drops %s, temporarily and uncached", async (_label, value) => {
    // A 307: the category may be published later, and a cached permanent
    // answer without it would lose the filter for good.
    expect(
      await get(`?q=hallo&category=${encodeURIComponent(value())}`)
    ).toEqual(temporary("/nl/gestures?q=hallo"));
  });

  it("translates a mix, keeps what matches and drops the rest", async () => {
    const query = `?q=hallo&category=cat-${RUN},unknown-${RUN}&category=${plainCategoryId}&page=3`;

    expect(await get(query)).toEqual(
      temporary(
        `/nl/gestures?q=hallo&page=3&category=${encodeURIComponent(`${legacyCategoryId},${plainCategoryId}`)}`
      )
    );
  });

  it("does not call a value dropped when two name the same category", async () => {
    expect(await get(`?category=cat-${RUN},${legacyCategoryId}`)).toEqual(
      permanent(`/nl/gestures?category=${legacyCategoryId}`)
    );
  });

  it("answers a HEAD the same way", async () => {
    expect(await get(`?category=cat-${RUN}`, "HEAD")).toEqual(
      permanent(`/nl/gestures?category=${legacyCategoryId}`)
    );
  });
});
