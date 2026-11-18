/**
 * The brand share cards, `public/og-<locale>.png` (1200 × 630), one per
 * shipped language: the deep green of the header, the white logo, the
 * approved tagline in Figtree Bold, "SMOG gestures on video" under it, and
 * the open hand (welcome) reaching in from the right edge.
 *
 * Run it after changing the tagline, the logo, the hands or the green
 * (`bun -F @smog/site share-cards`); the files are committed and builds never
 * run it. The text is drawn as glyph outlines from the font file, so the
 * output does not depend on the fonts installed on the machine, and
 * `packages/testing/bun/shared/site-scripts/share-cards.test.ts` fails when
 * a committed card drifts from this plan.
 *
 * A translator's edit of the tagline (the `ui_string` overlay) does not
 * reach these images: they are the shipped text, made at commit time.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { LOCALES } from "@smog/config/constants";
import { createI18n } from "@smog/i18n";
import { tokens } from "@smog/styles/tokens";
import sharp from "sharp";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ART = `${REPO_ROOT}packages/brand/src/art/`;
const FONTS = `${REPO_ROOT}packages/pdf/assets/`;
export const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 80;

const GREEN = tokens.color.light.sidebar;
const WHITE = tokens.color.light.sidebarForeground;
const MUTED = tokens.color.light.sidebarForegroundMuted;

/** The logo's height: well above the 32 px minimum for the lockup with hands. */
const LOGO_HEIGHT = 60;
const TAGLINE = { lineHeight: 1.12, maxWidth: 780, size: 62 } as const;
const SUBLINE_SIZE = 34;

/** The open hand (`hand-3.svg`, welcome), cropped by the right edge. */
const HAND = { stroke: 7, width: 480, x: 840, y: 360 } as const;

type Font = ReturnType<typeof fontkit.create>;

const OPEN_TAG = /^<svg\b[^>]*>/;
const VIEW_BOX = /\bviewBox="([^"]+)"/;
const WHITESPACE = /\s+/;
const PAINT_ATTRIBUTE =
  /\b(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="([^"]*)"/g;

interface Art {
  body: string;
  height: number;
  viewBox: string;
  width: number;
}

/**
 * One artwork file, its root's paint attributes (`fill`, `stroke`, the line
 * width and caps: the hands are strokes) moved onto a group, any of them
 * overridden by `paint`.
 */
function readArt(name: string, paint: Record<string, string> = {}): Art {
  const source = readFileSync(`${ART}${name}`, "utf8");
  const open = source.match(OPEN_TAG)?.[0] ?? "";
  const viewBox = open.match(VIEW_BOX)?.[1] ?? "";
  const [, , width = 0, height = 0] = viewBox.split(WHITESPACE).map(Number);
  if (!(width && height)) {
    throw new Error(`[share-cards] ${name} has no readable viewBox`);
  }
  const attributes = Object.fromEntries(
    [...open.matchAll(PAINT_ATTRIBUTE)].map(([, key = "", value = ""]) => [
      key,
      value,
    ])
  );
  const group = Object.entries({ ...attributes, ...paint })
    .map(([key, value]) => ` ${key}="${value}"`)
    .join("");
  return {
    body: `<g${group}>${source.slice(open.length, source.lastIndexOf("</svg>"))}</g>`,
    height,
    viewBox,
    width,
  };
}

function place(
  art: Art,
  x: number,
  y: number,
  width: number,
  colour: string
): string {
  const height = (width * art.height) / art.width;
  return `<svg x="${x}" y="${y}" width="${width}" height="${round(height)}" viewBox="${art.viewBox}" color="${colour}">${art.body}</svg>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function textWidth(font: Font, text: string, size: number): number {
  return (font.layout(text).advanceWidth * size) / font.unitsPerEm;
}

/** One line of text as glyph outlines, its baseline at `y`. */
function textPath(
  font: Font,
  text: string,
  x: number,
  y: number,
  size: number,
  colour: string
): string {
  const scale = size / font.unitsPerEm;
  const run = font.layout(text);
  let pen = 0;
  const glyphs = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const gx = x + (pen + (position?.xOffset ?? 0)) * scale;
    pen += position?.xAdvance ?? glyph.advanceWidth;
    const d = glyph.path.toSVG();
    return d
      ? `<path transform="translate(${round(gx)} ${y}) scale(${round(scale * 1e4) / 1e4} ${-round(scale * 1e4) / 1e4})" d="${d}"/>`
      : "";
  });
  return `<g fill="${colour}">${glyphs.join("")}</g>`;
}

/**
 * Word wrap to `maxWidth` in as few lines as fit, then as even as those
 * lines allow (no orphaned last word, like `text-wrap: balance`).
 */
function balancedWrap(
  font: Font,
  text: string,
  size: number,
  maxWidth: number
): string[] {
  const count = greedyWrap(font, text, size, maxWidth).length;
  let low = 0;
  let high = maxWidth;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (greedyWrap(font, text, size, middle).length > count) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return greedyWrap(font, text, size, high);
}

/** Greedy word wrap to `maxWidth`. */
function greedyWrap(
  font: Font,
  text: string,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(font, next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

export interface ShareCardOutput {
  locale: string;
  /** Absolute path of the PNG. */
  path: string;
  svg: string;
}

/** What `main` writes and the drift test re-renders. */
export function shareCardPlan(): ShareCardOutput[] {
  const bold = fontkit.create(readFileSync(`${FONTS}Figtree-Bold.ttf`));
  const regular = fontkit.create(readFileSync(`${FONTS}Figtree-Regular.ttf`));
  const logo = readArt("logo.svg");
  // The hands are drawn with a non-scaling hairline: a card-sized line here.
  const hand = readArt("hand-3.svg", { "stroke-width": String(HAND.stroke) });
  return LOCALES.map((locale) => {
    const { t } = createI18n(locale);
    const lines = balancedWrap(
      bold,
      t("home.tagline"),
      TAGLINE.size,
      TAGLINE.maxWidth
    );
    const step = TAGLINE.size * TAGLINE.lineHeight;
    const top = 270;
    const tagline = lines
      .map((line, index) =>
        textPath(
          bold,
          line,
          MARGIN,
          round(top + index * step),
          TAGLINE.size,
          WHITE
        )
      )
      .join("");
    const subline = textPath(
      regular,
      t("meta.home.title"),
      MARGIN,
      round(top + (lines.length - 1) * step + SUBLINE_SIZE * 2),
      SUBLINE_SIZE,
      MUTED
    );
    const logoWidth = (LOGO_HEIGHT * logo.width) / logo.height;
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="${GREEN}"/>`,
      place(hand, HAND.x, HAND.y, HAND.width, MUTED),
      place(logo, MARGIN, 72, round(logoWidth), WHITE),
      tagline,
      subline,
      "</svg>",
    ].join("\n");
    return { locale, path: `${PUBLIC_DIR}og-${locale}.png`, svg };
  });
}

/** Renders one card, opaque (no alpha: networks show it on any background). */
export async function renderShareCard(svg: string): Promise<Buffer> {
  return await sharp(Buffer.from(svg))
    .flatten({ background: GREEN })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main(): Promise<void> {
  await Promise.all(
    shareCardPlan().map(async ({ path, svg }) => {
      writeFileSync(path, await renderShareCard(svg));
      console.log(`[share-cards] wrote ${path}`);
    })
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error("[share-cards] Failed to write the share cards:", error);
    throw error;
  }
}
