import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearGuestFavorites,
  GUEST_FAVORITES_KEY,
  MAX_GUEST_FAVORITES,
  readGuestFavorites,
  toggleGuestFavorite,
} from "./guest";

describe("guest favourites", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("starts empty", async () => {
    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("adds an id", async () => {
    await expect(toggleGuestFavorite("a")).resolves.toEqual(["a"]);
  });

  it("removes an id that is already there", async () => {
    await toggleGuestFavorite("a");

    await expect(toggleGuestFavorite("a")).resolves.toEqual([]);
  });

  it("keeps the other ids when one is removed", async () => {
    await toggleGuestFavorite("a");
    await toggleGuestFavorite("b");
    await toggleGuestFavorite("c");

    await expect(toggleGuestFavorite("b")).resolves.toEqual(["a", "c"]);
  });

  it("keeps the order gestures were favourited in", async () => {
    await toggleGuestFavorite("c");
    await toggleGuestFavorite("a");
    await toggleGuestFavorite("b");

    await expect(readGuestFavorites()).resolves.toEqual(["c", "a", "b"]);
  });

  it("survives a corrupt stored value", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, "{not json");

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("survives a stored value that is JSON but not an array", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, '{"a":1}');

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("survives a stored value that is JSON null", async () => {
    // A successful parse (`JSON.parse("null")` does not throw), so only the
    // array check stops it reaching `.filter` on `null`.
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, "null");

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("drops non-string entries rather than rendering them", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, '["a", 3, null, "b"]');

    await expect(readGuestFavorites()).resolves.toEqual(["a", "b"]);
  });

  it("drops duplicates already in the store", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, '["a", "b", "a"]');

    await expect(readGuestFavorites()).resolves.toEqual(["a", "b"]);
  });

  it("repairs a corrupt store on the next write rather than compounding it", async () => {
    await AsyncStorage.setItem(GUEST_FAVORITES_KEY, "{not json");

    await expect(toggleGuestFavorite("a")).resolves.toEqual(["a"]);
    await expect(readGuestFavorites()).resolves.toEqual(["a"]);
  });

  /**
   * An earlier version of this module truncated
   * storage at `MAX_GUEST_FAVORITES`, silently deleting the reader's oldest
   * favourite once they passed it — a destructive "fix" for a cap
   * `guestStore.ts` never actually enforced. `MAX_GUEST_FAVORITES` is a
   * query-time bound now (`data/favorites.ts` imports it for exactly one
   * request's `where[id][in]` list); nothing here may ever throw a stored id
   * away to satisfy it. This fixture is the one that would have failed
   * against the truncating version: it favourites more ids than the bound
   * and asserts every one of them survived.
   */
  it("keeps every id, however many are favourited — storage is never truncated", async () => {
    const total = MAX_GUEST_FAVORITES + 50;

    for (let i = 0; i < total; i += 1) {
      await toggleGuestFavorite(`g${i}`);
    }

    const ids = await readGuestFavorites();

    expect(ids).toHaveLength(total);
    expect(ids).toContain("g0"); // the oldest — not evicted
    expect(ids).toContain(`g${total - 1}`); // the newest
  });

  it("forgets the whole list when it is cleared", async () => {
    await toggleGuestFavorite("a");
    await toggleGuestFavorite("b");

    await clearGuestFavorites();

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("does not throw when AsyncStorage rejects on read", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(
      new Error("native module unavailable")
    );

    await expect(readGuestFavorites()).resolves.toEqual([]);
  });

  it("does not throw when AsyncStorage rejects on write", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full")
    );

    await expect(toggleGuestFavorite("a")).resolves.toEqual(["a"]);
  });

  it("still reports the toggled list when the write failed", async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full")
    );

    await expect(toggleGuestFavorite("a")).resolves.toEqual(["a"]);
  });

  it("does not throw when clearing is refused", async () => {
    await toggleGuestFavorite("a");
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(
      new Error("denied")
    );

    await expect(clearGuestFavorites()).resolves.toBeUndefined();
  });
});
