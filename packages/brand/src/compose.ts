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
/** The monochrome lockups: the ink the app draws text in (light theme). */
export const INK = tokens.color.light.foreground;

export const ART_DIR = fileURLToPath(new URL("./art/", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Width of the app icon hand (`art/icon-hand.svg`) on a full green square,
 * as a fraction of the edge: the store icon, the PWA icons and the Apple
 * touch icon. Leaves the iOS and launcher corner masks clear of the line.
 */
const ICON_HAND_WIDTH = 0.66;

/**
 * Width of the small mark (`art/mark.svg`) on the favicon square. Larger
 * than the app icon's hand: at 16 px every pixel of the line counts.
 */
const FAVICON_MARK_WIDTH = 0.84;

/** Corner radius of the rounded-square favicon, as a fraction of the edge. */
const FAVICON_CORNER_RADIUS = 0.1875;

/**
 * Diameter of the circle the stacked mark must fit inside, as a fraction of
 * the canvas edge. Launchers and splash screens crop icons to shapes that
 * only this circle is guaranteed to survive.
 */
const MASKABLE_SAFE_ZONE = 0.8;
const ANDROID_SAFE_ZONE = 0.66;
/**
 * The hand in the launcher circles, as a fraction of the safe circle: the
 * glyph is drawn with a margin inside it, like the square icons.
 */
const HAND_IN_CIRCLE = 0.9;

/** Width of the horizontal logo on the share image, as a fraction. */
const OG_LOGO_WIDTH = 0.6;

/** Height of the 1x horizontal logo in the app, in points. */
const APP_LOGO_HEIGHT = 32;

/**
 * Height of the email header logo (`@smog/email`'s layout shows it 40 px
 * tall), rendered at 2x. Email clients do not show SVG, so it is a PNG,
 * flattened onto the header green.
 */
const EMAIL_LOGO_HEIGHT = 80;

/**
 * Clear space around a reversed lockup, as a fraction of the artwork's
 * height, on every side: the panel for banners and the PDF header.
 */
const REVERSED_PADDING = 0.6;

const ICO_SIZES = [16, 32, 48] as const;

const OPEN_TAG = /^<svg\b[^>]*>/;
const VIEW_BOX = /\bviewBox="([^"]+)"/;
const WHITESPACE = /\s+/;
/** Root attributes that paint the drawing (the stroked art sets them once). */
const PAINT_ATTRIBUTE = /\s(fill|stroke(?:-[a-z]+)?)="([^"]*)"/g;

interface Artwork {
  /** The root element's children, still in `currentColor`. */
  body: string;
  height: number;
  /**
   * The root's paint attributes (` fill="none" stroke=...`), carried onto
   * the nested `<svg>` so stroked artwork keeps its stroke when composed.
   */
  paint: string;
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
  const paint = [...open.matchAll(PAINT_ATTRIBUTE)]
    .map(([, attribute, value]) => ` ${attribute}="${value}"`)
    .join("");
  return {
    body: source.slice(open.length, close).trim(),
    height,
    paint,
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
    `<svg x="${round(x)}" y="${round(y)}" width="${round(artWidth)}" height="${round(artHeight)}" viewBox="${artwork.viewBox}"${recolour(artwork.paint, colour)}>`,
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
  const hand = readArtwork("icon-hand.svg");
  const mark = readArtwork("mark.svg");

  // The app icon: one bold hand (the logo's pointing hand) on the green.
  const handOnSquare = (size: number): string =>
    compose(square(size), hand, WHITE, size * ICON_HAND_WIDTH, {
      colour: GREEN,
      radius: 0,
    });
  const handInCircle = (
    size: number,
    safeZone: number,
    background?: Background
  ): string =>
    compose(
      square(size),
      hand,
      WHITE,
      widthInCircle(hand, size * safeZone * HAND_IN_CIRCLE),
      background
    );
  // Favicons (16 to 48 px and the SVG icon): the small mark, whose line
  // still holds at 16 px.
  const favicon = (size: number): string =>
    compose(square(size), mark, WHITE, size * FAVICON_MARK_WIDTH, {
      colour: GREEN,
      radius: size * FAVICON_CORNER_RADIUS,
    });

  // Android reads only the alpha of the monochrome layer, so the white
  // foreground already is the silhouette it needs.
  const foreground = handInCircle(1024, ANDROID_SAFE_ZONE);
  // The splash keeps the stacked wordmark (the hand is the icon, the name
  // greets on launch); Android 12+ crops it to the launcher circle.
  const splash = compose(
    square(1024),
    stacked,
    WHITE,
    widthInCircle(stacked, 1024 * ANDROID_SAFE_ZONE)
  );
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

  const emailLogo = {
    height: EMAIL_LOGO_HEIGHT,
    width: Math.round((EMAIL_LOGO_HEIGHT * logo.width) / logo.height),
  };

  // The lockups for banners and print: white on a green panel (reversed)
  // and one flat ink colour on transparent (monochrome).
  const lockups = [
    { artwork: logo, name: "logo" },
    { artwork: stacked, name: "logo-stacked" },
  ].flatMap(({ artwork, name }) => {
    const pad = artwork.height * REVERSED_PADDING;
    const panel = {
      height: artwork.height + 2 * pad,
      width: artwork.width + 2 * pad,
    };
    return [
      {
        contents: compose(panel, artwork, WHITE, artwork.width, {
          colour: GREEN,
          radius: 0,
        }),
        path: `${SITE}/brand/${name}-reversed.svg`,
      },
      {
        contents: compose(artwork, artwork, INK, artwork.width),
        path: `${SITE}/brand/${name}-mono.svg`,
      },
    ];
  });

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
        svg: handOnSquare(180),
      },
      { opaque: true, path: `${SITE}/icon-192.png`, svg: handOnSquare(192) },
      { opaque: true, path: `${SITE}/icon-512.png`, svg: handOnSquare(512) },
      {
        opaque: true,
        path: `${SITE}/icon-maskable-512.png`,
        svg: handInCircle(512, MASKABLE_SAFE_ZONE, {
          colour: GREEN,
          radius: 0,
        }),
      },
      // The store icon (iOS before 26 and Expo's fallback; iOS 26 reads the
      // layered `smog.icon`). Full bleed: the platforms round the corners.
      { opaque: true, path: `${MOBILE}/icon.png`, svg: handOnSquare(1024) },
      {
        opaque: true,
        path: `${SITE}/og.png`,
        svg: compose(og, logo, WHITE, og.width * OG_LOGO_WIDTH, {
          colour: GREEN,
          radius: 0,
        }),
      },
      {
        opaque: true,
        path: `${SITE}/brand/email-logo.png`,
        svg: compose(emailLogo, logo, WHITE, emailLogo.width, {
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
      { opaque: false, path: `${MOBILE}/splash-icon.png`, svg: splash },
      ...logos,
    ],
    vectors: [
      { contents: favicon(512), path: `${SITE}/icon.svg` },
      { contents: logoSource, path: `${SITE}/brand/logo.svg` },
      {
        contents: recolour(logoSource, GREEN),
        path: `${SITE}/brand/logo-green.svg`,
      },
      // The old site's /assets/logo.svg (inventory R-18): the green logo,
      // unhashed, at the path outside links and printed material know.
      {
        contents: recolour(logoSource, GREEN),
        path: `${SITE}/assets/logo.svg`,
      },
      {
        contents: recolour(logoSource, WHITE),
        path: `${SITE}/brand/logo-white.svg`,
      },
      {
        contents: recolour(readArt("logo-stacked.svg"), WHITE),
        path: `${SITE}/brand/logo-stacked-white.svg`,
      },
      ...lockups,
      ...[
        "hand-1.svg",
        "hand-2.svg",
        "hand-3.svg",
        "logo-small.svg",
        "mark.svg",
      ].map((name) => ({
        contents: readArt(name),
        path: `${SITE}/brand/${name}`,
      })),
    ],
  };
}
