import { describe, expect, it } from "vitest";
import {
  type GestureListQuery,
  gestureListHref,
  parseGestureListParams,
  toSearchParams,
} from "./gestureListParams";

const EMPTY: GestureListQuery = { categories: [], page: 1, q: "" };

describe("toSearchParams", () => {
  it("keeps every value of a repeated key", () => {
    expect(toSearchParams({ category: ["3", "7"] }).getAll("category")).toEqual(
      ["3", "7"]
    );
  });

  it("drops a key Next left undefined", () => {
    expect(toSearchParams({ q: undefined }).has("q")).toBe(false);
  });
});

describe("parseGestureListParams", () => {
  const parse = (query: string) =>
    parseGestureListParams(new URLSearchParams(query));

  it("reads an empty query as the unfiltered first page", () => {
    expect(parse("")).toEqual(EMPTY);
  });

  it("reads the comma-separated category form apps/web already emits", () => {
    expect(parse("category=3,7").categories).toEqual(["3", "7"]);
  });

  it("reads a repeated category key too", () => {
    expect(parse("category=3&category=7").categories).toEqual(["3", "7"]);
  });

  it("drops blank category ids rather than filtering on an empty id", () => {
    // `{ in: [""] }` matches nothing, so `?category=,` would empty the page.
    expect(parse("category=,3,").categories).toEqual(["3"]);
  });

  it("falls back to the first page for a page that is not a number", () => {
    expect(parse("page=banana").page).toBe(1);
  });

  it("falls back to the first page for a page below one", () => {
    expect(parse("page=0").page).toBe(1);
    expect(parse("page=-4").page).toBe(1);
  });

  it("reads a real page number", () => {
    expect(parse("page=3").page).toBe(3);
  });

  it("reads the query", () => {
    expect(parse("q=hallo").q).toBe("hallo");
  });
});

describe("gestureListHref", () => {
  it("returns the bare path when nothing is set", () => {
    expect(gestureListHref("/nl/gestures", EMPTY, {})).toBe("/nl/gestures");
  });

  it("omits the first page rather than writing ?page=1", () => {
    expect(gestureListHref("/nl/gestures", EMPTY, { page: 1 })).toBe(
      "/nl/gestures"
    );
  });

  it("writes a later page", () => {
    expect(gestureListHref("/nl/gestures", EMPTY, { page: 2 })).toBe(
      "/nl/gestures?page=2"
    );
  });

  it("keeps the filters when only the page changes", () => {
    expect(
      gestureListHref(
        "/nl/gestures",
        { categories: ["3"], page: 1, q: "hallo" },
        { page: 2 }
      )
    ).toBe("/nl/gestures?q=hallo&category=3&page=2");
  });

  it("returns to the first page when a category is chosen", () => {
    // Page 3 of a one-page result is an empty grid under a filter that
    // matched plenty. `fetchGestures` clamps it, but the URL would still lie.
    expect(
      gestureListHref(
        "/nl/gestures",
        { categories: [], page: 3, q: "" },
        { categories: ["3"] }
      )
    ).toBe("/nl/gestures?category=3");
  });

  it("returns to the first page when the search changes", () => {
    expect(
      gestureListHref(
        "/nl/gestures",
        { categories: [], page: 3, q: "" },
        { q: "hallo" }
      )
    ).toBe("/nl/gestures?q=hallo");
  });

  it("returns to the first page when a filter is cleared", () => {
    // Clearing narrows nothing, but the page count still changes, so the
    // same reset applies — and `"categories" in patch` is what makes an
    // empty array count as a change rather than as "unset".
    expect(
      gestureListHref(
        "/nl/gestures",
        { categories: ["3"], page: 3, q: "" },
        { categories: [] }
      )
    ).toBe("/nl/gestures");
  });

  it("omits a blank query instead of leaving ?q= behind", () => {
    expect(
      gestureListHref(
        "/nl/gestures",
        { categories: [], page: 1, q: "" },
        {
          q: "   ",
        }
      )
    ).toBe("/nl/gestures");
  });

  it("keeps the locale that is already in the path", () => {
    expect(gestureListHref("/fr/gestures", EMPTY, { page: 2 })).toBe(
      "/fr/gestures?page=2"
    );
  });
});
