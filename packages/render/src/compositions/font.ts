import interLatin600 from "@fontsource/inter/files/inter-latin-600-normal.woff2";
import interLatinExt600 from "@fontsource/inter/files/inter-latin-ext-600-normal.woff2";

/** The overlay's font family, the same in the render and the Player (ruling 6). */
export const OVERLAY_FONT_FAMILY = "SMOG Overlay";

/** The overlay's weight (the old overlay's 600). */
export const OVERLAY_FONT_WEIGHT = "600";

/**
 * Inter 600 (OFL-1.1, `@fontsource/inter`), latin and latin-ext, as asset
 * URLs: the bundler emits each file and answers its URL.
 */
export const OVERLAY_FONT_FILES = [
  { subset: "latin", url: interLatin600 },
  { subset: "latin-ext", url: interLatinExt600 },
] as const;
