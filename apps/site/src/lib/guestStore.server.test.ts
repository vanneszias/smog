// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { readGuestFavorites, toggleGuestFavorite } from "./guestStore";

/**
 * The same module, with no `window` at all.
 *
 * `guestStore` is imported by two client components, and a client component
 * is still **server-rendered** — `"use client"` marks a hydration boundary,
 * not a server exclusion. So this module's functions do run in an environment
 * where `window` is not merely empty but undeclared, where reading the
 * identifier is a `ReferenceError` rather than the `SecurityError` the
 * browser guards catch.
 *
 * A separate file rather than a case in `guestStore.test.ts` because the
 * environment is per file: the jsdom suite next door cannot express "there is
 * no window", which is exactly the condition under test.
 */
describe("guest favorites on the server", () => {
  it("has no window to read", () => {
    // The guard on the test below: without this, a jsdom-by-accident run
    // would make the rest of the file pass while proving nothing.
    expect(typeof window).toBe("undefined");
  });

  it("returns an empty list rather than throwing a ReferenceError", () => {
    expect(readGuestFavorites()).toEqual([]);
  });

  it("swallows a write there is nowhere to make", () => {
    expect(() => toggleGuestFavorite("a")).not.toThrow();
    expect(toggleGuestFavorite("a")).toEqual(["a"]);
  });

  it("says nothing about it", () => {
    /*
     * This is what the `typeof window` check buys, and it is the only thing
     * it buys: the try/catch below it already swallows the `ReferenceError`,
     * so both versions *return* an empty list. Without the check, every
     * server render of every page carrying a favourite control writes a
     * warning line — one per request in production, for a condition that is
     * not a fault and that nobody can act on.
     *
     * Recorded because mutation testing found it: removing the check failed
     * no test until this one existed.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    readGuestFavorites();
    toggleGuestFavorite("a");

    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
