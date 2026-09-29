/**
 * The brand output plan: which file gets which SVG document. Pure (it only
 * reads the artwork), so the generator writes from it and the drift tests
 * compare the committed files with a fresh render of the same plan.
 *
 * The artwork is drawn in `currentColor`. Each output substitutes a fixed
 * colour, because a PNG has no text colour to inherit.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@smog/styles/tokens";
import { recolour } from "./recolour";

export const GREEN = tokens.color.brand.green;
export const WHITE = tokens.color.brand.white;

export const ART_DIR = fileURLToPath(new URL("./art/", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Width of the stacked mark on a full green square, as a fraction of the
 * edge. Taken from the store icon (`art/icon.png`), so every square icon
 * matches the one people already have on their home screen.
 */
const SQUARE_MARK_WIDTH = 0.845;

/** Corner radius of the rounded-square favicon, as a fraction of the edge. */
const FAVICON_CORNER_RADIUS = 0.1875;

/**
 * Diameter of the circle the stacked mark must fit inside, as a fraction of
 * the canvas edge. Launchers and splash screens crop icons to shapes that
 * only this circle is guaranteed to survive.
 */
const MASKABLE_SAFE_ZONE = 0.8;
const ANDROID_SAFE_ZONE = 0.66;

/** Width of the horizontal logo on the share image, as a fraction. */
const OG_LOGO_WIDTH = 0.6;

/** Height of the 1x horizontal logo in the app, in points. */
const APP_LOGO_HEIGHT = 32;

const ICO_SIZES = [16, 32, 48] as const;

const OPEN_TAG = /^<svg\b[^>]*>/;
const VIEW_BOX = /\bviewBox="([^"]+)"/;
const WHITESPACE = /\s+/;

interface Artwork {
  /** The root element's children, still in `currentColor`. */
  body: string;
  height: number;
  viewBox: string;
  width: number;
}

function readArt(name: string): string {
  return readFileSync(join(ART_DIR, name), "utf8");
}

function readArtwork(name: string): Artwork {
  const source = readArt(name);
  const open = source.match(OPEN_TAG)?.[0] ?? "";
  const viewBox = open.match(VIEW_BOX)?.[1] ?? "";
  const close = source.lastIndexOf("</svg>");
  if (viewBox === "" || close < 0) {
    throw new Error(`[brand] ${name} is not an <svg> root with a viewBox`);
  }
  const [, , width, height] = viewBox.split(WHITESPACE).map(Number);
  if (!(width && height)) {
    throw new Error(`[brand] ${name} has an unreadable viewBox`);
  }
  return {
    body: source.slice(open.length, close).trim(),
    height,
    viewBox,
    width,
  };
}

interface Background {
  colour: string;
  /** Corner radius in canvas units; 0 for a full square. */
  radius: number;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Centres `artwork`, `artWidth` canvas units wide, on the canvas as one SVG
 * document: the same document whether it ends up as a vector file or a
 * raster.
 */
function compose(
  canvas: { width: number; height: number },
  artwork: Artwork,
  colour: string,
  artWidth: number,
  background?: Background
): string {
  const artHeight = (artWidth * artwork.height) / artwork.width;
  const x = (canvas.width - artWidth) / 2;
  const y = (canvas.height - artHeight) / 2;
  const rect = background
    ? `<rect width="${canvas.width}" height="${canvas.height}"${
        background.radius ? ` rx="${round(background.radius)}"` : ""
      } fill="${background.colour}"/>`
    : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">`,
    rect,
    `<svg x="${round(x)}" y="${round(y)}" width="${round(artWidth)}" height="${round(artHeight)}" viewBox="${artwork.viewBox}">`,
    recolour(artwork.body, colour),
    "</svg>",
    "</svg>",
    "",
  ].join("\n");
}

/** Widest the artwork can be while its bounding box fits a circle. */
function widthInCircle(artwork: Artwork, diameter: number): number {
  return (diameter * artwork.width) / Math.hypot(artwork.width, artwork.height);
}

function square(size: number): { height: number; width: number } {
  return { height: size, width: size };
}

/** One PNG output: its repo-relative path and the SVG it is rendered from. */
interface RasterOutput {
  /** Flattened onto the green, with no alpha channel. */
  opaque: boolean;
  path: string;
  svg: string;
}

export interface BrandPlan {
  favicon: { path: string; images: { size: number; svg: string }[] };
  rasters: RasterOutput[];
  /** SVG files written as text: repo-relative path → contents. */
  vectors: { path: string; contents: string }[];
}

const SITE = "apps/site/public";
const MOBILE = "apps/mobile/assets";

export function brandPlan(): BrandPlan {
  const logo = readArtwork("logo.svg");
  const stacked = readArtwork("logo-stacked.svg");

  const onSquare = (size: number, radius: number): string =>
    compose(square(size), stacked, WHITE, size * SQUARE_MARK_WIDTH, {
      colour: GREEN,
      radius: size * radius,
    });
  const inCircle = (
    size: number,
    safeZone: number,
    background?: Background
  ): string =>
    compose(
      square(size),
      stacked,
      WHITE,
      widthInCircle(stacked, size * safeZone),
      background
    );
  const favicon = (size: number): string =>
    onSquare(size, FAVICON_CORNER_RADIUS);

  // Android reads only the alpha of the monochrome layer, so the white
  // foreground already is the silhouette it needs; Android 12+ crops the
  // splash icon to the same circle as the launcher.
  const foreground = inCircle(1024, ANDROID_SAFE_ZONE);
  const og = { height: 630, width: 1200 };

  const logos = [
    { colour: WHITE, name: "logo-white" },
    { colour: GREEN, name: "logo-green" },
  ].flatMap(({ colour, name }) =>
    [
      { factor: 1, suffix: "" },
      { factor: 2, suffix: "@2x" },
      { factor: 3, suffix: "@3x" },
    ].map(({ factor, suffix }) => {
      const height = APP_LOGO_HEIGHT * factor;
      const width = Math.round((height * logo.width) / logo.height);
      return {
        opaque: false,
        path: `${MOBILE}/${name}${suffix}.png`,
        svg: compose({ height, width }, logo, colour, width),
      };
    })
  );

  const logoSource = readArt("logo.svg");
  return {
    favicon: {
      images: ICO_SIZES.map((size) => ({ size, svg: favicon(size) })),
      path: `${SITE}/favicon.ico`,
    },
    rasters: [
      {
        opaque: true,
        path: `${SITE}/apple-touch-icon.png`,
        svg: onSquare(180, 0),
      },
      { opaque: true, path: `${SITE}/icon-192.png`, svg: onSquare(192, 0) },
      { opaque: true, path: `${SITE}/icon-512.png`, svg: onSquare(512, 0) },
      {
        opaque: true,
        path: `${SITE}/icon-maskable-512.png`,
        svg: inCircle(512, MASKABLE_SAFE_ZONE, { colour: GREEN, radius: 0 }),
      },
      {
        opaque: true,
        path: `${SITE}/og.png`,
        svg: compose(og, logo, WHITE, og.width * OG_LOGO_WIDTH, {
          colour: GREEN,
          radius: 0,
        }),
      },
      {
        opaque: false,
        path: `${MOBILE}/android-icon-foreground.png`,
        svg: foreground,
      },
      {
        opaque: false,
        path: `${MOBILE}/android-icon-monochrome.png`,
        svg: foreground,
      },
      { opaque: false, path: `${MOBILE}/splash-icon.png`, svg: foreground },
      ...logos,
    ],
    vectors: [
      { contents: favicon(512), path: `${SITE}/icon.svg` },
      { contents: logoSource, path: `${SITE}/brand/logo.svg` },
      {
        contents: recolour(logoSource, GREEN),
        path: `${SITE}/brand/logo-green.svg`,
      },
      {
        contents: recolour(logoSource, WHITE),
        path: `${SITE}/brand/logo-white.svg`,
      },
      {
        contents: recolour(readArt("logo-stacked.svg"), WHITE),
        path: `${SITE}/brand/logo-stacked-white.svg`,
      },
      ...["hand-1.svg", "hand-2.svg", "hand-3.svg"].map((hand) => ({
        contents: readArt(hand),
        path: `${SITE}/brand/${hand}`,
      })),
    ],
  };
}
