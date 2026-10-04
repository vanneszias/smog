import { describe, expect, it } from "bun:test";
import type { LoadFontOptions } from "@remotion/fonts";
import {
  createOverlayFontLoader,
  OVERLAY_FONT_FAMILY,
  OVERLAY_FONT_FILES,
  OVERLAY_FONT_STACK,
} from "./font";

describe("the overlay font loader", () => {
  it("loads each Inter 600 subset once under the overlay family", async () => {
    const calls: LoadFontOptions[] = [];
    const loader = createOverlayFontLoader((options) => {
      calls.push(options);
      return Promise.resolve();
    });
    expect(loader.isLoaded()).toBe(false);
    await Promise.all([loader.load(), loader.load()]);
    await loader.load();
    expect(loader.isLoaded()).toBe(true);
    expect(calls).toHaveLength(OVERLAY_FONT_FILES.length);
    for (const [index, file] of OVERLAY_FONT_FILES.entries()) {
      expect(calls[index]).toEqual({
        family: OVERLAY_FONT_FAMILY,
        format: "woff2",
        unicodeRange: file.unicodeRange,
        url: file.url,
        weight: "600",
      });
    }
  });

  it("covers Latin, Cyrillic, Greek and Vietnamese, each subset scoped by its range", () => {
    expect(OVERLAY_FONT_FILES.map(({ subset }) => subset)).toEqual([
      "latin",
      "latin-ext",
      "cyrillic",
      "cyrillic-ext",
      "greek",
      "greek-ext",
      "vietnamese",
    ]);
    const range = (subset: string): string =>
      OVERLAY_FONT_FILES.find((file) => file.subset === subset)?.unicodeRange ??
      "";
    expect(range("latin")).toContain("U+0000-00FF");
    expect(range("latin-ext")).toContain("U+0100-02BA");
    expect(range("cyrillic")).toContain("U+0400-045F");
    expect(range("greek")).toContain("U+03A3-03FF");
    expect(range("vietnamese")).toContain("U+1EA0-1EF9");
  });

  it("falls back to Noto Sans, then the generic sans-serif", () => {
    expect(OVERLAY_FONT_STACK).toBe(
      `"${OVERLAY_FONT_FAMILY}", "Noto Sans", sans-serif`
    );
  });

  it("forgets a failed load, so the next call tries again", async () => {
    let attempts = 0;
    const loader = createOverlayFontLoader(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve();
    });
    await expect(loader.load()).rejects.toThrow("offline");
    expect(loader.isLoaded()).toBe(false);
    await loader.load();
    expect(loader.isLoaded()).toBe(true);
  });
});
