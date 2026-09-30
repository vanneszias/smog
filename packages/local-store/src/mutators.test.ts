import { describe, expect, test } from "bun:test";
import { RECENT_SEARCHES_MAX } from "@smog/config/constants";
import {
  addRecentSearch,
  addToList,
  clearRecentSearches,
  createList,
  deleteList,
  dismissImportFor,
  IMPORT_DISMISSED_MAX,
  isFavorite,
  removeFromList,
  renameList,
  reorderList,
  selectList,
  setConsent,
  setPreferences,
  toggleFavorite,
} from "./mutators";
import { defaultGuestData, type GuestData, guestDataSchema } from "./schema";

function withList(ids: string[]): GuestData {
  return {
    ...defaultGuestData(),
    lists: [
      {
        createdAt: 1,
        gestureIds: ids,
        id: "loc_1",
        name: "Mijn lijst",
        updatedAt: 1,
      },
    ],
  };
}

describe("favorites", () => {
  test("toggle adds then removes, and is an involution", () => {
    const start = defaultGuestData();
    const on = toggleFavorite("g1")(start);
    expect(isFavorite(on, "g1")).toBe(true);
    const off = toggleFavorite("g1")(on);
    expect(off.favorites).toEqual([]);
    expect(toggleFavorite("g1")(toggleFavorite("g1")(on))).toEqual(on);
  });

  test("appends new favorites in order", () => {
    const data = toggleFavorite("b")(toggleFavorite("a")(defaultGuestData()));
    expect(data.favorites).toEqual(["a", "b"]);
  });
});

describe("recent searches", () => {
  test("keeps the newest 10 after 11 adds", () => {
    let data = defaultGuestData();
    for (let i = 1; i <= 11; i += 1) {
      data = addRecentSearch(`q${i}`)(data);
    }
    expect(data.recentSearches).toHaveLength(RECENT_SEARCHES_MAX);
    expect(data.recentSearches[0]).toBe("q11");
    expect(data.recentSearches).not.toContain("q1");
  });

  test("trims and dedupes case-insensitively, newest first", () => {
    let data = addRecentSearch("Hond")(defaultGuestData());
    data = addRecentSearch("kat")(data);
    data = addRecentSearch("hond ")(data);
    expect(data.recentSearches).toEqual(["hond", "kat"]);
  });

  test("ignores blank queries; clear empties", () => {
    const data = addRecentSearch("   ")(defaultGuestData());
    expect(data.recentSearches).toEqual([]);
    expect(
      clearRecentSearches()(addRecentSearch("a")(data)).recentSearches
    ).toEqual([]);
  });
});

describe("lists", () => {
  test("createList uses a loc_ id, timestamps and optional description", () => {
    const data = createList("Favorieten", "Beschrijving")(defaultGuestData());
    const [list] = data.lists;
    expect(list?.id.startsWith("loc_")).toBe(true);
    expect(list?.name).toBe("Favorieten");
    expect(list?.description).toBe("Beschrijving");
    expect(list?.gestureIds).toEqual([]);
    expect(list?.createdAt).toBe(list?.updatedAt ?? -1);
  });

  test("rename, add without duplicates, remove, delete", () => {
    let data = withList([]);
    data = renameList("loc_1", "Nieuw", 5)(data);
    expect(selectList(data, "loc_1")?.name).toBe("Nieuw");
    expect(selectList(data, "loc_1")?.updatedAt).toBe(5);
    data = addToList("loc_1", "g1", 6)(data);
    data = addToList("loc_1", "g1", 7)(data);
    expect(selectList(data, "loc_1")?.gestureIds).toEqual(["g1"]);
    data = removeFromList("loc_1", "g1", 8)(data);
    expect(selectList(data, "loc_1")?.gestureIds).toEqual([]);
    data = deleteList("loc_1")(data);
    expect(data.lists).toEqual([]);
  });

  test("reorder accepts a permutation", () => {
    const data = reorderList(
      "loc_1",
      ["c", "a", "b"],
      9
    )(withList(["a", "b", "c"]));
    expect(selectList(data, "loc_1")?.gestureIds).toEqual(["c", "a", "b"]);
    expect(selectList(data, "loc_1")?.updatedAt).toBe(9);
  });

  test("reorder throws unless the ids are a permutation", () => {
    const data = withList(["a", "b", "c"]);
    expect(() => reorderList("loc_1", ["a", "b"])(data)).toThrow();
    expect(() => reorderList("loc_1", ["a", "b", "d"])(data)).toThrow();
    expect(() => reorderList("loc_1", ["a", "a", "b"])(data)).toThrow();
    expect(() => reorderList("loc_1", ["a", "b", "c", "c"])(data)).toThrow();
  });

  test("unknown list ids are a no-op, except reorder which throws", () => {
    const data = withList(["a"]);
    expect(addToList("nope", "x")(data)).toEqual(data);
    expect(() => reorderList("nope", ["a"])(data)).toThrow();
  });
});

describe("consent and preferences", () => {
  test("setConsent records the decision time", () => {
    const data = setConsent(true, 42)(defaultGuestData());
    expect(data.consent).toEqual({ analytics: true, decidedAt: 42 });
    expect(setConsent(false, 43)(data).consent.analytics).toBe(false);
  });

  test("setConsent marks a copy of an account's decision, and a guest's own choice drops the mark", () => {
    const mirrored = setConsent(true, 42, "user-anna")(defaultGuestData());
    expect(mirrored.consent).toEqual({
      analytics: true,
      decidedAt: 42,
      mirroredFrom: "user-anna",
    });
    expect(setConsent(false, 43)(mirrored).consent).toEqual({
      analytics: false,
      decidedAt: 43,
    });
    expect(guestDataSchema.parse(mirrored).consent.mirroredFrom).toBe(
      "user-anna"
    );
  });

  test("setPreferences merges", () => {
    const data = setPreferences({ theme: "dark" })(defaultGuestData());
    expect(data.preferences).toEqual({
      importDismissedFor: [],
      locale: null,
      theme: "dark",
    });
    expect(setPreferences({ locale: "fr" })(data).preferences).toEqual({
      importDismissedFor: [],
      locale: "fr",
      theme: "dark",
    });
  });

  test("dismissImportFor remembers the user once, newest last, bounded", () => {
    const once = dismissImportFor("u1")(defaultGuestData());
    expect(once.preferences.importDismissedFor).toEqual(["u1"]);
    expect(dismissImportFor("u1")(once)).toBe(once);
    const many = Array.from({ length: IMPORT_DISMISSED_MAX + 3 }, (_, i) =>
      dismissImportFor(`u${i}`)
    ).reduce((data, mutator) => mutator(data), defaultGuestData());
    const ids = many.preferences.importDismissedFor;
    expect(ids).toHaveLength(IMPORT_DISMISSED_MAX);
    expect(ids.at(-1)).toBe(`u${IMPORT_DISMISSED_MAX + 2}`);
    expect(ids).not.toContain("u0");
  });
});
