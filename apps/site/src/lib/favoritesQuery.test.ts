import { describe, expect, it } from "vitest";
import type { Gesture } from "@/payload-types";
import {
  favoriteGesturesUrl,
  MAX_FAVORITE_IDS,
  readFavoriteGestures,
  usableFavoriteIds,
} from "./favoritesQuery";

const gesture = (id: number, name: string | null): Gesture =>
  ({
    createdAt: "2026-09-20T00:00:00.000Z",
    id,
    isActive: true,
    name,
    playbackId: `pb-${id}`,
    updatedAt: "2026-09-20T00:00:00.000Z",
  }) as Gesture;

describe("usableFavoriteIds", () => {
  it("keeps the ids that look like ids", () => {
    expect(usableFavoriteIds(["7", "12"])).toEqual(["7", "12"]);
  });

  it("drops anything that is not one", () => {
    // These come out of `localStorage`, which anyone can write. Payload maps
    // an `in` list onto `parseFloat` for an integer column, so `"abc"` would
    // otherwise reach D1 as `NaN`.
    expect(
      usableFavoriteIds(["abc", "", "0", "-1", "1e3", "1.5", " 1", "7"])
    ).toEqual(["7"]);
  });

  it("drops a leading-zero id rather than normalizing it", () => {
    // `007` and `7` would both resolve to row 7, and the answer could then
    // not be matched back to the id that was asked for.
    expect(usableFavoriteIds(["007"])).toEqual([]);
  });

  it("resolves a repeated id once", () => {
    // Two cards with the same React key is a rendering bug.
    expect(usableFavoriteIds(["7", "7", "9"])).toEqual(["7", "9"]);
  });

  it("keeps the order they were favourited in", () => {
    expect(usableFavoriteIds(["9", "7", "12"])).toEqual(["9", "7", "12"]);
  });

  it("stops at the cap rather than binding an unbounded IN list", () => {
    // D1 caps how many parameters a statement may bind, and this list comes
    // from a store with no size limit of its own.
    const many = Array.from({ length: MAX_FAVORITE_IDS + 50 }, (_, index) =>
      String(index + 1)
    );

    expect(usableFavoriteIds(many)).toHaveLength(MAX_FAVORITE_IDS);
    expect(usableFavoriteIds(many).at(-1)).toBe(String(MAX_FAVORITE_IDS));
  });

  it("returns nothing for nothing", () => {
    expect(usableFavoriteIds([])).toEqual([]);
  });
});

describe("favoriteGesturesUrl", () => {
  const params = (ids: string[], locale: "nl" | "en" | "fr" = "nl") =>
    new URLSearchParams(favoriteGesturesUrl(ids, locale).split("?")[1]);

  it("asks Payload's own collection endpoint", () => {
    expect(favoriteGesturesUrl(["7"], "nl").startsWith("/api/gestures?")).toBe(
      true
    );
  });

  it("constrains to active gestures, so an inactive one cannot leak", () => {
    // `publicReadActive` already enforces this on an anonymous request; the
    // clause keeps the page correct the day someone loosens access for an
    // unrelated reason.
    expect(params(["7"]).get("where[isActive][equals]")).toBe("true");
  });

  it("asks for exactly the ids it was given", () => {
    expect(params(["7", "9"]).get("where[id][in]")).toBe("7,9");
  });

  it("asks for a page as big as the list, not Payload's default ten", () => {
    // A guest with eleven favorites would otherwise silently see ten.
    const ids = Array.from({ length: 11 }, (_, index) => String(index + 1));

    expect(params(ids).get("limit")).toBe("11");
  });

  it("asks for the three fields a card draws and no others", () => {
    // Whole documents carry `info`, `concepts` and every upload field for
    // rows the page only draws a card for.
    const query = params(["7"]);

    expect(query.get("select[name]")).toBe("true");
    expect(query.get("select[categories]")).toBe("true");
    expect(query.get("select[playbackId]")).toBe("true");
    expect(query.get("select[info]")).toBeNull();
  });

  it("populates the categories, which have no name at depth 0", () => {
    expect(params(["7"]).get("depth")).toBe("1");
  });

  it("asks in the reader's own locale", () => {
    expect(params(["7"], "fr").get("locale")).toBe("fr");
  });
});

/**
 * The cards, insisting there were some.
 *
 * `readFavoriteGestures` answers `null` for "this is not an answer", and the
 * tests that are about the *contents* should fail loudly rather than quietly
 * indexing into nothing if that ever starts happening.
 */
const cardsFrom = (body: unknown, ids: string[]) => {
  const cards = readFavoriteGestures(body, ids);

  if (cards === null) {
    throw new Error("expected an answer, got null");
  }

  return cards;
};

describe("readFavoriteGestures", () => {
  it("turns documents into cards", () => {
    expect(
      readFavoriteGestures({ docs: [gesture(7, "Hallo")] }, ["7"])
    ).toEqual([{ categories: [], id: "7", name: "Hallo", playbackId: "pb-7" }]);
  });

  it("puts them back in the order they were favourited", () => {
    // Payload answers in the database's order; the guest's order is the one
    // the page renders. Both directions, so whatever the database does, one
    // of these disagrees with it.
    const docs = [gesture(7, "Zeven"), gesture(9, "Negen")];

    expect(cardsFrom({ docs }, ["9", "7"]).map((card) => card.id)).toEqual([
      "9",
      "7",
    ]);
    expect(cardsFrom({ docs }, ["7", "9"]).map((card) => card.id)).toEqual([
      "7",
      "9",
    ]);
  });

  it("drops an id that resolved to nothing", () => {
    // Deleted, or deactivated since it was saved. The list is a set of
    // bookmarks; a shorter list is the right answer, not an error.
    expect(
      cardsFrom({ docs: [gesture(7, "Zeven")] }, ["7", "9"]).map(
        (card) => card.id
      )
    ).toEqual(["7"]);
  });

  it("names an untranslated gesture with something rather than null", () => {
    expect(cardsFrom({ docs: [gesture(7, null)] }, ["7"])[0]?.name).toBe("");
  });

  it("populates category names when they came back populated", () => {
    const doc = {
      ...gesture(7, "Hallo"),
      categories: [{ id: 4, isActive: true, name: "Begroetingen" }],
    } as unknown as Gesture;

    expect(cardsFrom({ docs: [doc] }, ["7"])[0]?.categories).toEqual([
      { id: "4", name: "Begroetingen" },
    ]);
  });

  it("drops a bare category id, which has no name to render", () => {
    const doc = {
      ...gesture(7, "Hallo"),
      categories: [4],
    } as unknown as Gesture;

    expect(cardsFrom({ docs: [doc] }, ["7"])[0]?.categories).toEqual([]);
  });

  it("reports an answer that is not one, rather than an empty list", () => {
    // "We could not ask" and "you have none" are different things, and only
    // one of them is the reader's fault. `response.json()` succeeding says
    // the bytes were JSON, not that they were Payload's.
    expect(readFavoriteGestures({ errors: ["nope"] }, ["7"])).toBeNull();
    expect(readFavoriteGestures({ docs: "nope" }, ["7"])).toBeNull();
    expect(readFavoriteGestures(null, ["7"])).toBeNull();
    expect(readFavoriteGestures("<!doctype html>", ["7"])).toBeNull();
  });

  it("drops a row that is not a document rather than rendering a blank card", () => {
    expect(
      cardsFrom({ docs: [gesture(7, "Zeven"), null, {}] }, ["7"])
    ).toHaveLength(1);
  });

  it("returns an empty list when nothing matched, which is not an error", () => {
    expect(readFavoriteGestures({ docs: [] }, ["7"])).toEqual([]);
  });
});
