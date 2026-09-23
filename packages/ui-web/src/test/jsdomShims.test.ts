import { describe, expect, it } from "vitest";
import "./jsdomShims";

/**
 * The shims are only worth having if they are actually installed, and one of
 * them was not: jsdom declares `matchMedia` on the window and leaves it
 * `undefined`, so the `"matchMedia" in globalThis` guard this file used to
 * have was already true and skipped the shim. Every caller then read
 * `undefined` and threw — which is how `@mux/mux-player-react` fails to
 * import under jsdom.
 *
 * A guard that silently does nothing is the failure this file exists to
 * catch, so these assert the shimmed APIs are callable rather than merely
 * present.
 */
describe("jsdomShims", () => {
  it("installs a callable matchMedia", () => {
    expect(typeof globalThis.matchMedia).toBe("function");
    expect(globalThis.matchMedia("(min-width: 1px)").matches).toBe(false);
  });

  it("installs a constructible ResizeObserver", () => {
    expect(typeof globalThis.ResizeObserver).toBe("function");
    expect(() =>
      new ResizeObserver(() => undefined).disconnect()
    ).not.toThrow();
  });

  it("gives every element the pointer-capture methods Radix calls", () => {
    const element = document.createElement("div");
    expect(element.hasPointerCapture(1)).toBe(false);
    expect(() => element.scrollIntoView()).not.toThrow();
  });
});
