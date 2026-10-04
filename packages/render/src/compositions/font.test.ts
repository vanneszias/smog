import { describe, expect, it } from "bun:test";
import type { LoadFontOptions } from "@remotion/fonts";
import {
  createOverlayFontLoader,
  OVERLAY_FONT_FAMILY,
  OVERLAY_FONT_FILES,
  OVERLAY_FONT_STACK,
  overlayFontSubsets,
} from "./font";

const ALWAYS = ["latin", "latin-ext"];

/** The subsets as plain strings, for `toEqual` against literals. */
function subsetsOf(text?: string): string[] {
  return overlayFontSubsets(text);
}

function recordingLoader(fail: (subset: string) => boolean = () => false) {
  const calls: LoadFontOptions[] = [];
  const subsetOf = (options: LoadFontOptions): string =>
    OVERLAY_FONT_FILES.find((file) => file.url === options.url)?.subset ?? "";
  const loader = createOverlayFontLoader((options) => {
    calls.push(options);
    return fail(subsetOf(options))
      ? Promise.reject(new Error(`${subsetOf(options)} offline`))
      : Promise.resolve();
  });
  return { calls, loader, subsets: () => calls.map(subsetOf) };
}

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

  it("needs latin and latin-ext always, and the subsets a text's characters fall in", () => {
    expect(subsetsOf("Bakkerij Jansen")).toEqual(ALWAYS);
    expect(subsetsOf("Café Ölçü")).toEqual(ALWAYS);
    expect(subsetsOf("Пекарня")).toEqual([...ALWAYS, "cyrillic"]);
    expect(subsetsOf("Ѣ")).toEqual([...ALWAYS, "cyrillic-ext"]);
    expect(subsetsOf("Αθήνα")).toEqual([...ALWAYS, "greek"]);
    expect(subsetsOf("ἀρχή")).toEqual([...ALWAYS, "greek", "greek-ext"]);
    expect(subsetsOf("Phở Hà Nội")).toEqual([...ALWAYS, "vietnamese"]);
    // A script Inter lacks needs nothing more (the fallback font draws it).
    expect(subsetsOf("مخبز الأمل")).toEqual(ALWAYS);
    // No text: every subset (the render).
    expect(subsetsOf()).toEqual(OVERLAY_FONT_FILES.map(({ subset }) => subset));
  });

  it("loads only the subsets a name needs, then the next ones a new name needs", async () => {
    const { loader, subsets } = recordingLoader();
    expect(loader.isLoaded("Bakkerij Jansen")).toBe(false);
    await loader.load("Bakkerij Jansen");
    expect(subsets()).toEqual(ALWAYS);
    expect(loader.isLoaded("Bakkerij Jansen")).toBe(true);
    expect(loader.isLoaded("Пекарня")).toBe(false);
    expect(loader.isLoaded()).toBe(false);
    await loader.load("Пекарня");
    expect(subsets()).toEqual([...ALWAYS, "cyrillic"]);
    expect(loader.isLoaded("Пекарня")).toBe(true);
  });

  it("does not fail on a subset nobody needs: it is never fetched", async () => {
    const { loader, subsets } = recordingLoader(
      (subset) => subset === "greek-ext"
    );
    await loader.load("Bakkerij Jansen");
    expect(subsets()).not.toContain("greek-ext");
    expect(loader.isLoaded("Bakkerij Jansen")).toBe(true);
  });

  it("fails on a subset the name needs, keeps the ones that loaded, and retries only the failed one", async () => {
    // Cyrillic fails once, then comes back.
    const cyrillicDown = new Set(["cyrillic"]);
    const { loader, subsets } = recordingLoader((subset) =>
      cyrillicDown.has(subset)
    );
    await expect(loader.load("Пекарня")).rejects.toThrow("cyrillic offline");
    expect(loader.isLoaded("Пекарня")).toBe(false);
    expect(loader.isLoaded("Bakkerij")).toBe(true);
    cyrillicDown.clear();
    await loader.load("Пекарня");
    expect(subsets()).toEqual([...ALWAYS, "cyrillic", "cyrillic"]);
    expect(loader.isLoaded("Пекарня")).toBe(true);
  });
});
