import interCyrillic600 from "@fontsource/inter/files/inter-cyrillic-600-normal.woff2";
import interCyrillicExt600 from "@fontsource/inter/files/inter-cyrillic-ext-600-normal.woff2";
import interGreek600 from "@fontsource/inter/files/inter-greek-600-normal.woff2";
import interGreekExt600 from "@fontsource/inter/files/inter-greek-ext-600-normal.woff2";
import interLatin600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import interLatinExt600 from "@fontsource/inter/files/inter-latin-ext-600-normal.woff2";
import interVietnamese600 from "@fontsource/inter/files/inter-vietnamese-600-normal.woff2";
import { type LoadFontOptions, loadFont } from "@remotion/fonts";

/**
 * The overlay's Inter, under its own family name so it never collides with
 * the site's UI font (ruling 6). The same in the render and the Player.
 */
export const OVERLAY_FONT_FAMILY = "SMOG Overlay";

/**
 * The overlay's CSS font stack: Inter, then Noto Sans (the render image's
 * `fonts-noto-core` covers Arabic, Hebrew and more; in the Player, the
 * viewer's own), then the generic sans-serif. CJK draws in whatever
 * fallback exists (task 3 review, I-1).
 */
export const OVERLAY_FONT_STACK = `"${OVERLAY_FONT_FAMILY}", "Noto Sans", sans-serif`;

/** The overlay's weight (the old overlay's 600). */
export const OVERLAY_FONT_WEIGHT = "600";

/**
 * Inter 600 (OFL-1.1, `@fontsource/inter`) as asset URLs: the bundler emits
 * each file and answers its URL. Each file carries `@fontsource/inter`'s own
 * unicode range, so the browser only fetches a subset a text uses. The
 * ranges overlap on a few combining marks (U+0300-0309, U+0323, U+0329);
 * the browser then picks either file, and both draw them.
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
  {
    subset: "cyrillic",
    unicodeRange: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
    url: interCyrillic600,
  },
  {
    subset: "cyrillic-ext",
    unicodeRange:
      "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
    url: interCyrillicExt600,
  },
  {
    subset: "greek",
    unicodeRange:
      "U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF",
    url: interGreek600,
  },
  {
    subset: "greek-ext",
    unicodeRange: "U+1F00-1FFF",
    url: interGreekExt600,
  },
  {
    subset: "vietnamese",
    unicodeRange:
      "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB",
    url: interVietnamese600,
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
