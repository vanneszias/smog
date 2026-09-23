import { describe, expect, it } from "vitest";
import { buildGestureWhere, toGestureSummary } from "./gestureQuery";

describe("buildGestureWhere", () => {
  it("always constrains to active gestures, so an inactive one cannot leak", () => {
    expect(buildGestureWhere({})).toEqual({ isActive: { equals: true } });
  });

  it("adds a category constraint when categories are given", () => {
    expect(buildGestureWhere({ categories: ["3", "7"] })).toEqual({
      and: [{ isActive: { equals: true } }, { categories: { in: ["3", "7"] } }],
    });
  });

  it("ignores an empty category list rather than emitting an empty `in`", () => {
    // `{ in: [] }` matches nothing, which would silently empty the page.
    expect(buildGestureWhere({ categories: [] })).toEqual({
      isActive: { equals: true },
    });
  });

  it("ignores a whitespace-only query", () => {
    expect(buildGestureWhere({ q: "   " })).toEqual({
      isActive: { equals: true },
    });
  });
});

describe("buildGestureWhere search seam", () => {
  it("constrains to the resolved ids when a query matched something", () => {
    // `search.ts` resolves the ids; this is where they plug in.
    expect(buildGestureWhere({ q: "hallo", searchIds: [3, 7] })).toEqual({
      and: [{ isActive: { equals: true } }, { id: { in: [3, 7] } }],
    });
  });

  it("shows nothing when a query ran and matched nothing", () => {
    // The one place an empty `in` is right: a search that found nothing must
    // empty the page, unlike an unselected category filter.
    expect(buildGestureWhere({ q: "zzzz", searchIds: [] })).toEqual({
      and: [{ isActive: { equals: true } }, { id: { in: [] } }],
    });
  });

  it("does not constrain when no search has been resolved", () => {
    // `q` reached the URL, and nothing resolved it.
    expect(buildGestureWhere({ q: "hallo" })).toEqual({
      isActive: { equals: true },
    });
  });

  it("ignores resolved ids when the query is blank", () => {
    // `?q=` is what a cleared search box leaves behind. It means everything,
    // not the leftovers of the search before it.
    expect(buildGestureWhere({ q: "   ", searchIds: [] })).toEqual({
      isActive: { equals: true },
    });
  });

  it("combines a category filter and a search", () => {
    expect(
      buildGestureWhere({ categories: ["3"], q: "hallo", searchIds: [7] })
    ).toEqual({
      and: [
        { isActive: { equals: true } },
        { categories: { in: ["3"] } },
        { id: { in: [7] } },
      ],
    });
  });

  it("does not mutate the arrays it was given", () => {
    const categories = ["3"];
    const searchIds = [7];

    buildGestureWhere({ categories, q: "hallo", searchIds });

    expect(categories).toEqual(["3"]);
    expect(searchIds).toEqual([7]);
  });
});

describe("toGestureSummary", () => {
  const base = {
    categories: [],
    createdAt: "2026-09-20T00:00:00.000Z",
    id: 12,
    playbackId: "pb-12",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };

  it("stringifies the integer ids D1 returns", () => {
    expect(toGestureSummary({ ...base, name: "Hallo" }).id).toBe("12");
  });

  it("flattens populated categories and stringifies their ids too", () => {
    expect(
      toGestureSummary({
        ...base,
        categories: [
          {
            createdAt: base.createdAt,
            id: 4,
            name: "Begroetingen",
            updatedAt: base.updatedAt,
          },
        ],
        name: "Hallo",
      }).categories
    ).toEqual([{ id: "4", name: "Begroetingen" }]);
  });

  it("drops unpopulated category ids rather than rendering them", () => {
    // A `depth: 0` read leaves bare integers here, which have no name.
    expect(
      toGestureSummary({ ...base, categories: [4, 9], name: "Hallo" })
        .categories
    ).toEqual([]);
  });

  it("survives an untranslated name instead of rendering null", () => {
    expect(toGestureSummary({ ...base, name: null }).name).toBe("");
  });
});
