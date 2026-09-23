/**
 * Regenerates every icon and logo the site and the mobile app ship from the
 * artwork in `./art`. The outputs are committed; builds never run this, so
 * run it again (`bun -F @smog/brand generate`) after changing the artwork or
 * a layout below. Output is deterministic: the same sources give the same
 * bytes.
 *
 * The artwork is drawn in `currentColor`. Each output substitutes a fixed
 * colour before rasterising, because a PNG has no text colour to inherit.
 */

import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@smog/styles";
import sharp from "sharp";
import { encodeIco } from "./ico";
import { recolour } from "./recolour";

const GREEN = tokens.color.brand.primary;
const WHITE = tokens.color.white;

const ART_DIR = fileURLToPath(new URL("./art/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SITE_PUBLIC = join(REPO_ROOT, "apps/site/public");
const MOBILE_ASSETS = join(REPO_ROOT, "apps/mobile/assets");

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

interface Artwork {
  width: number;
  height: number;
  viewBox: string;
  /** The root element's children, still in `currentColor`. */
  body: string;
}

function readArtwork(name: string): { source: string; artwork: Artwork } {
  const source = readFileSync(join(ART_DIR, name), "utf8");
  const open = /^<svg\b[^>]*>/.exec(source);
  const viewBox = open ? /\bviewBox="([^"]+)"/.exec(open[0]) : null;
  const close = source.lastIndexOf("</svg>");
  if (!(open && viewBox?.[1]) || close < 0) {
    throw new Error(`[brand] ${name} is not an <svg> root with a viewBox`);
  }
  const [, , width, height] = viewBox[1].split(/\s+/).map(Number);
  if (!(width && height)) {
    throw new Error(`[brand] ${name} has an unreadable viewBox`);
  }
  return {
    source,
    artwork: {
      width,
      height,
      viewBox: viewBox[1],
      body: source.slice(open[0].length, close).trim(),
    },
  };
}

interface Background {
  colour: string;
  /** Corner radius in canvas units; 0 for a full square. */
  radius: number;
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

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Widest the artwork can be while its bounding box fits a circle. */
function widthInCircle(artwork: Artwork, diameter: number): number {
  return (diameter * artwork.width) / Math.hypot(artwork.width, artwork.height);
}

async function rasterise(svg: string, opaque: boolean): Promise<Buffer> {
  const image = sharp(Buffer.from(svg));
  const flat = opaque ? image.flatten({ background: GREEN }) : image;
  return await flat.png({ compressionLevel: 9 }).toBuffer();
}

function write(path: string, contents: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function stackedOnSquare(
  stacked: Artwork,
  size: number,
  radius: number
): string {
  return compose(
    { width: size, height: size },
    stacked,
    WHITE,
    size * SQUARE_MARK_WIDTH,
    { colour: GREEN, radius: size * radius }
  );
}

function stackedInCircle(
  stacked: Artwork,
  size: number,
  safeZone: number,
  background?: Background
): string {
  return compose(
    { width: size, height: size },
    stacked,
    WHITE,
    widthInCircle(stacked, size * safeZone),
    background
  );
}

async function generateSite(logo: Artwork, stacked: Artwork): Promise<void> {
  const favicon = (size: number): string =>
    stackedOnSquare(stacked, size, FAVICON_CORNER_RADIUS);

  const icoSizes = [16, 32, 48];
  const icoImages = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      png: await rasterise(favicon(size), false),
    }))
  );
  write(join(SITE_PUBLIC, "favicon.ico"), encodeIco(icoImages));
  write(join(SITE_PUBLIC, "icon.svg"), favicon(512));

  const square = (size: number): Promise<Buffer> =>
    rasterise(stackedOnSquare(stacked, size, 0), true);
  write(join(SITE_PUBLIC, "apple-touch-icon.png"), await square(180));
  write(join(SITE_PUBLIC, "icon-192.png"), await square(192));
  write(join(SITE_PUBLIC, "icon-512.png"), await square(512));
  write(
    join(SITE_PUBLIC, "icon-maskable-512.png"),
    await rasterise(
      stackedInCircle(stacked, 512, MASKABLE_SAFE_ZONE, {
        colour: GREEN,
        radius: 0,
      }),
      true
    )
  );

  const og = { width: 1200, height: 630 };
  write(
    join(SITE_PUBLIC, "og.png"),
    await rasterise(
      compose(og, logo, WHITE, og.width * OG_LOGO_WIDTH, {
        colour: GREEN,
        radius: 0,
      }),
      true
    )
  );
}

function generateSiteVectors(logoSource: string, stackedSource: string): void {
  const brandDir = join(SITE_PUBLIC, "brand");
  write(join(brandDir, "logo.svg"), logoSource);
  write(join(brandDir, "logo-green.svg"), recolour(logoSource, GREEN));
  write(join(brandDir, "logo-white.svg"), recolour(logoSource, WHITE));
  write(
    join(brandDir, "logo-stacked-white.svg"),
    recolour(stackedSource, WHITE)
  );
  for (const hand of ["hand-1.svg", "hand-2.svg", "hand-3.svg"]) {
    write(join(brandDir, hand), readFileSync(join(ART_DIR, hand)));
  }
}

async function generateMobile(logo: Artwork, stacked: Artwork): Promise<void> {
  // The store icon is the artwork itself, not a rendering of it: it must stay
  // the exact file the stores already ship.
  write(
    join(MOBILE_ASSETS, "icon.png"),
    readFileSync(join(ART_DIR, "icon.png"))
  );
  cpSync(join(ART_DIR, "smog.icon"), join(MOBILE_ASSETS, "smog.icon"), {
    recursive: true,
  });

  const foreground = await rasterise(
    stackedInCircle(stacked, 1024, ANDROID_SAFE_ZONE),
    false
  );
  write(join(MOBILE_ASSETS, "android-icon-foreground.png"), foreground);
  // Android reads only the alpha of the monochrome layer, so the white
  // foreground already is the silhouette it needs.
  write(join(MOBILE_ASSETS, "android-icon-monochrome.png"), foreground);
  // Android 12+ crops the splash icon to the same circle as the launcher.
  write(join(MOBILE_ASSETS, "splash-icon.png"), foreground);
  write(
    join(MOBILE_ASSETS, "favicon.png"),
    await rasterise(stackedOnSquare(stacked, 48, FAVICON_CORNER_RADIUS), false)
  );

  const variants = [
    { name: "logo-white", colour: WHITE },
    { name: "logo-green", colour: GREEN },
  ];
  const scales = [
    { suffix: "", factor: 1 },
    { suffix: "@2x", factor: 2 },
    { suffix: "@3x", factor: 3 },
  ];
  for (const { name, colour } of variants) {
    for (const { suffix, factor } of scales) {
      const height = APP_LOGO_HEIGHT * factor;
      const width = Math.round((height * logo.width) / logo.height);
      const svg = compose({ width, height }, logo, colour, width);
      write(
        join(MOBILE_ASSETS, `${name}${suffix}.png`),
        await rasterise(svg, false)
      );
    }
  }
}

async function main(): Promise<void> {
  const logo = readArtwork("logo.svg");
  const stacked = readArtwork("logo-stacked.svg");
  await generateSite(logo.artwork, stacked.artwork);
  generateSiteVectors(logo.source, stacked.source);
  await generateMobile(logo.artwork, stacked.artwork);
}

try {
  await main();
} catch (error) {
  console.error("[brand] Failed to generate the brand assets:", error);
  throw error;
}
