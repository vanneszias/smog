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
 * each file and answers its URL. Each file is registered with
 * `@fontsource/inter`'s own unicode range, so the browser draws each
 * character from the file whose range holds it. `@remotion/fonts`
 * `loadFont` fetches a file as soon as it is registered (a `fetch`, then
 * `FontFace.load()`), so the range does not make the fetch lazy: which
 * files load is chosen here (`overlayFontSubsets`). The ranges overlap on
 * a few combining marks (U+0300-0309, U+0323, U+0329); the browser then
 * picks either file, and both draw them.
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

/** One `@fontsource/inter` subset's name (`latin`, `cyrillic`, …). */
type OverlayFontSubset = (typeof OVERLAY_FONT_FILES)[number]["subset"];

/** The fixed intro is Latin, and `measureText` validates the font on it. */
const ALWAYS_LOADED: readonly OverlayFontSubset[] = ["latin", "latin-ext"];

const RANGE_PREFIX = /^U\+/;

/** `"U+0000-00FF,U+0131"` → `[[0x0, 0xff], [0x131, 0x131]]`. */
function parseRanges(unicodeRange: string): [number, number][] {
  return unicodeRange.split(",").map((part): [number, number] => {
    const [from = "", to = from] = part
      .trim()
      .replace(RANGE_PREFIX, "")
      .split("-");
    return [Number.parseInt(from, 16), Number.parseInt(to, 16)];
  });
}

const SUBSET_RANGES = OVERLAY_FONT_FILES.map(({ subset, unicodeRange }) => ({
  ranges: parseRanges(unicodeRange),
  subset,
}));

function holds(ranges: [number, number][], point: number): boolean {
  return ranges.some(([from, to]) => point >= from && point <= to);
}

/**
 * The subsets a text needs (fix wave M-2): latin and latin-ext always,
 * plus every subset whose range holds one of its characters, in
 * `OVERLAY_FONT_FILES` order. Without a text, every subset (the render: its
 * files are local). A character no subset holds (Arabic, CJK) needs none:
 * the fallback font draws it.
 */
export function overlayFontSubsets(text?: string): OverlayFontSubset[] {
  if (text === undefined) {
    return OVERLAY_FONT_FILES.map(({ subset }) => subset);
  }
  const points = [
    ...new Set(Array.from(text, (character) => character.codePointAt(0) ?? 0)),
  ];
  return SUBSET_RANGES.filter(
    ({ ranges, subset }) =>
      ALWAYS_LOADED.includes(subset) ||
      points.some((point) => holds(ranges, point))
  ).map(({ subset }) => subset);
}

export interface OverlayFontLoader {
  /**
   * Whether every subset `text` needs has loaded (every subset without a
   * text), so the overlay may measure it.
   */
  isLoaded: (text?: string) => boolean;
  /**
   * Loads the subsets `text` needs (every subset without a text), each
   * file once. A subset that fails fails the load, is forgotten and is
   * tried again next time; the subsets that loaded stay loaded. A subset
   * no text needs is never fetched, so it cannot fail a preview.
   */
  load: (text?: string) => Promise<void>;
}

/** The loader over a `loadFont` (`@remotion/fonts`, or a test's fake). */
export function createOverlayFontLoader(
  load: (options: LoadFontOptions) => Promise<void>
): OverlayFontLoader {
  const pending = new Map<OverlayFontSubset, Promise<void>>();
  const loaded = new Set<OverlayFontSubset>();
  const loadSubset = (subset: OverlayFontSubset): Promise<void> => {
    const known = pending.get(subset);
    if (known) {
      return known;
    }
    const file = OVERLAY_FONT_FILES.find((entry) => entry.subset === subset);
    if (!file) {
      return Promise.reject(new Error(`no overlay font subset ${subset}`));
    }
    const next = load({
      family: OVERLAY_FONT_FAMILY,
      format: "woff2",
      unicodeRange: file.unicodeRange,
      url: file.url,
      weight: OVERLAY_FONT_WEIGHT,
    }).then(
      () => {
        loaded.add(subset);
      },
      (error: unknown) => {
        pending.delete(subset);
        throw error;
      }
    );
    pending.set(subset, next);
    return next;
  };
  return {
    isLoaded: (text) =>
      overlayFontSubsets(text).every((subset) => loaded.has(subset)),
    load: async (text) => {
      await Promise.all(overlayFontSubsets(text).map(loadSubset));
    },
  };
}

const overlayFont = createOverlayFontLoader(loadFont);

/**
 * Loads the overlay font into this document (ruling 6): the subsets `text`
 * needs, or every subset without a text. The render loads them all under
 * `delayRender`; the Player's overlay and the wizard pass the display name,
 * so a preview fetches only the files it draws with (fix wave M-2).
 */
export function loadOverlayFont(text?: string): Promise<void> {
  return overlayFont.load(text);
}

/** Whether `loadOverlayFont(text)` has resolved in this document. */
export function isOverlayFontLoaded(text?: string): boolean {
  return overlayFont.isLoaded(text);
}
