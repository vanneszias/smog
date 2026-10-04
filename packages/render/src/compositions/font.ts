import interLatin600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import interLatinExt600 from "@fontsource/inter/files/inter-latin-ext-600-normal.woff2";
import { type LoadFontOptions, loadFont } from "@remotion/fonts";

/** The overlay's font family, the same in the render and the Player (ruling 6). */
export const OVERLAY_FONT_FAMILY = "SMOG Overlay";

/** The overlay's weight (the old overlay's 600). */
export const OVERLAY_FONT_WEIGHT = "600";

/**
 * Inter 600 (OFL-1.1, `@fontsource/inter`), latin and latin-ext, as asset
 * URLs: the bundler emits each file and answers its URL. The unicode ranges
 * are `@fontsource/inter`'s own, so each glyph comes from one file.
 */
export const OVERLAY_FONT_FILES = [
  {
    subset: "latin",
    unicodeRange:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    url: interLatin600,
  },
  {
    subset: "latin-ext",
    unicodeRange:
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    url: interLatinExt600,
  },
] as const;

export interface OverlayFontLoader {
  /** Whether every file has loaded (the overlay may measure text). */
  isLoaded: () => boolean;
  /** Loads every file once; a failed load is forgotten and tried again. */
  load: () => Promise<void>;
}

/** The loader over a `loadFont` (`@remotion/fonts`, or a test's fake). */
export function createOverlayFontLoader(
  load: (options: LoadFontOptions) => Promise<void>
): OverlayFontLoader {
  let pending: Promise<void> | null = null;
  let loaded = false;
  return {
    isLoaded: () => loaded,
    load: () => {
      pending ??= Promise.all(
        OVERLAY_FONT_FILES.map(({ unicodeRange, url }) =>
          load({
            family: OVERLAY_FONT_FAMILY,
            format: "woff2",
            unicodeRange,
            url,
            weight: OVERLAY_FONT_WEIGHT,
          })
        )
      ).then(
        () => {
          loaded = true;
        },
        (error: unknown) => {
          pending = null;
          throw error;
        }
      );
      return pending;
    },
  };
}

const overlayFont = createOverlayFontLoader(loadFont);

/**
 * Loads the overlay font into this document (ruling 6). The composition
 * calls it under `delayRender`; the wizard calls it before the Player
 * mounts, so the first frame already has its text.
 */
export function loadOverlayFont(): Promise<void> {
  return overlayFont.load();
}

/** Whether `loadOverlayFont` has resolved in this document. */
export function isOverlayFontLoaded(): boolean {
  return overlayFont.isLoaded();
}
