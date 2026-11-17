import { tokens } from "@smog/styles/tokens";
import { rgb } from "pdf-lib";

type PdfColour = ReturnType<typeof rgb>;

/** `#00805F` → pdf-lib's 0 to 1 channels. */
function fromHex(hex: string): PdfColour {
  const [r, g, b] = [1, 3, 5].map(
    (start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255
  );
  return rgb(r ?? 0, g ?? 0, b ?? 0);
}

const { light } = tokens.color;

/**
 * The print palette: the light theme's roles, so a lesson PDF and the site
 * are one identity (paper is white, as the card). Every text pair is in
 * `@smog/styles/contrast`: `foreground` and `mutedForeground` on `card`,
 * `primaryStrong` on `primarySubtle` (the section rows).
 */
export const PDF_COLOURS = {
  /** Section titles: the brand's green for text, on the section shade. */
  green: fromHex(light.primaryStrong),
  ink: fromHex(light.foreground),
  /** Default-language fallback text and page furniture. */
  muted: fromHex(light.mutedForeground),
  /** Table borders: the functional edge colour. */
  rule: fromHex(light.input),
  /** The section rows' fill. */
  shade: fromHex(light.primarySubtle),
} as const;
