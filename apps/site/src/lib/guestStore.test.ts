import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGuestFavorites,
  GUEST_FAVORITES_KEY,
  readGuestFavorites,
  toggleGuestFavorite,
} from "./guestStore";

/**
 * jsdom's own `localStorage` accessor, kept so the test that replaces it can
 * put it back.
 *
 * Captured once at module load rather than inside the test: a `defineProperty`
 * that is not undone leaks a throwing store into every later test in this
 * file, and diagnosing that costs an hour that has nothing to do with the
 * change being made.
 */
const LOCAL_STORAGE_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  window,
  "localStorage"
) as PropertyDescriptor;

/*
 * `restoreAllMocks` rather than `clearAllMocks`, and it is not a stylistic
 * choice. Several tests below replace `Storage.prototype.getItem` or
 * `setItem` with something that throws; a spy that is merely *cleared* keeps
 * the replacement installed, so the next test in the file reads from a
 * localStorage that still refuses to answer and fails for a reason that has
 * nothing to do with what it is testing.
 *
 * The order matters too: restore first, then clear. Clearing through a
 * throwing spy would throw here instead of in a test.
 */
afterEach(() => {
  Object.defineProperty(window, "localStorage", LOCAL_STORAGE_DESCRIPTOR);
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("guest favorites", () => {
  it("returns an empty list when nothing is stored", () => {
    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when localStorage throws", () => {
    // Private browsing and blocked site data both throw on access rather
    // than returning null. A render that throws here takes the page down —
    // a blank page, not a degraded one.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when the localStorage property itself throws", () => {
    // The commoner shape of the same failure, and the one Chrome produces
    // with site data blocked: it is the *getter* on `window` that throws, so
    // the guard has to be around the property access and not only around the
    // method call. `typeof localStorage === "undefined"` does not help —
    // evaluating the identifier is what throws.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("denied", "SecurityError");
      },
    });

    expect(readGuestFavorites()).toEqual([]);
    expect(() => toggleGuestFavorite("a")).not.toThrow();
  });

  it("reads normally again once the denial is lifted", () => {
    // The guard on the test above: if the spy leaked out of it, this test
    // would fail and the leak would be diagnosed here rather than blamed on
    // whatever ran next.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["a"]');

    expect(readGuestFavorites()).toEqual(["a"]);
  });

  it("returns an empty list when the stored value is not JSON", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, "{not json");

    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when the stored value is JSON but not an array", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '{"a":1}');

    expect(readGuestFavorites()).toEqual([]);
  });

  it("returns an empty list when the stored value is JSON null", () => {
    // `JSON.parse("null")` is a successful parse, so this gets past the
    // try/catch and only the array check stops it. `null.filter` is a throw.
    localStorage.setItem(GUEST_FAVORITES_KEY, "null");

    expect(readGuestFavorites()).toEqual([]);
  });

  it("drops non-string entries rather than rendering them", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, '["a", 3, null, "b"]');

    expect(readGuestFavorites()).toEqual(["a", "b"]);
  });

  it("drops duplicates, which would otherwise render the same card twice", () => {
    // Two cards with the same React key is a rendering bug, not a cosmetic
    // one, and a store written by an older build is exactly where a
    // duplicate comes from.
    localStorage.setItem(GUEST_FAVORITES_KEY, '["a", "b", "a"]');

    expect(readGuestFavorites()).toEqual(["a", "b"]);
  });

  it("does not throw when writing exceeds quota", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(() => toggleGuestFavorite("a")).not.toThrow();
  });

  it("still reports the toggled list when the write failed", () => {
    // The button has to show *something* after it is pressed. Reporting the
    // intended list keeps this session's UI honest about what the reader
    // asked for; the next reload is where the lost write becomes visible.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    expect(toggleGuestFavorite("a")).toEqual(["a"]);
  });

  it("does not throw when reading is denied during a toggle", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    expect(() => toggleGuestFavorite("a")).not.toThrow();
  });

  it("adds an id that was not there", () => {
    expect(toggleGuestFavorite("a")).toEqual(["a"]);
    expect(readGuestFavorites()).toEqual(["a"]);
  });

  it("removes an id that was there", () => {
    toggleGuestFavorite("a");

    expect(toggleGuestFavorite("a")).toEqual([]);
    expect(readGuestFavorites()).toEqual([]);
  });

  it("keeps the other ids when one is removed", () => {
    toggleGuestFavorite("a");
    toggleGuestFavorite("b");
    toggleGuestFavorite("c");

    expect(toggleGuestFavorite("b")).toEqual(["a", "c"]);
    expect(readGuestFavorites()).toEqual(["a", "c"]);
  });

  it("keeps the order gestures were favourited in", () => {
    // The favorites page renders in this order, so it is part of the
    // contract rather than an accident of the implementation.
    toggleGuestFavorite("c");
    toggleGuestFavorite("a");
    toggleGuestFavorite("b");

    expect(readGuestFavorites()).toEqual(["c", "a", "b"]);
  });

  it("repairs a corrupt store on the next write rather than compounding it", () => {
    localStorage.setItem(GUEST_FAVORITES_KEY, "{not json");

    expect(toggleGuestFavorite("a")).toEqual(["a"]);
    expect(readGuestFavorites()).toEqual(["a"]);
  });

  it("stores under a namespaced key, so it cannot collide with another app on the origin", () => {
    toggleGuestFavorite("a");

    expect(GUEST_FAVORITES_KEY).toBe("smog.guest.favorites");
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBe('["a"]');
  });

  it("forgets the whole list when it is cleared", () => {
    toggleGuestFavorite("a");
    toggleGuestFavorite("b");

    clearGuestFavorites();

    expect(readGuestFavorites()).toEqual([]);
    // The key is removed rather than set to "[]": an absent key is the state
    // a browser that never favourited anything is already in.
    expect(localStorage.getItem(GUEST_FAVORITES_KEY)).toBeNull();
  });

  it("leaves nothing else on the origin behind", () => {
    // The clear is aimed at one key. A `localStorage.clear()` here would
    // take the theme preference and anything else this origin holds with it.
    localStorage.setItem("smog.theme", "dark");
    toggleGuestFavorite("a");

    clearGuestFavorites();

    expect(localStorage.getItem("smog.theme")).toBe("dark");
  });

  it("gives up quietly when the store refuses to be cleared", () => {
    // Same contract as every other function here: the worst outcome is that
    // nothing happens. A throw would be an unhandled error inside the mount
    // effect that calls this, which blanks the page below it.
    toggleGuestFavorite("a");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => clearGuestFavorites()).not.toThrow();
  });
});
