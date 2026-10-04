import { describe, expect, it } from "bun:test";
import type { LoadFontOptions } from "@remotion/fonts";
import {
  createOverlayFontLoader,
  OVERLAY_FONT_FAMILY,
  OVERLAY_FONT_FILES,
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

  it("has a disjoint unicode range per subset", () => {
    const [latin, latinExt] = OVERLAY_FONT_FILES;
    expect(latin.unicodeRange).toContain("U+0000-00FF");
    expect(latinExt.unicodeRange).toContain("U+0100-02BA");
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
