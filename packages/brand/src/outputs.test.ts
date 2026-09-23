import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tokens } from "@smog/styles";
import { describe, expect, it } from "vitest";
import {
  PNG_COLOUR_TYPE,
  readIco,
  readPngHeader,
  readXmlRoot,
} from "./test-helpers";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ART_DIR = fileURLToPath(new URL("./art/", import.meta.url));
const GREEN = tokens.color.brand.primary;
const WHITE = tokens.color.white;

/**
 * SHA-256 of the app icon the App Store and Play Store already ship. The
 * mobile icon is this file, not a rendering of the artwork; change the hash
 * only together with a deliberate new store icon.
 */
const STORE_ICON_SHA256 =
  "655c3d08a6a130140ad927b17cf40efa463c46aec20543ee6a93871fc7008042";

function read(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO_ROOT, path)));
}

interface PngExpectation {
  path: string;
  width: number;
  height: number;
  /** Launcher and share images must have no transparency to show through. */
  opaque: boolean;
}

function png(
  path: string,
  width: number,
  height: number,
  opaque: boolean
): PngExpectation {
  return { path, width, height, opaque };
}

const PNG_OUTPUTS: PngExpectation[] = [
  png("apps/site/public/apple-touch-icon.png", 180, 180, true),
  png("apps/site/public/icon-192.png", 192, 192, true),
  png("apps/site/public/icon-512.png", 512, 512, true),
  png("apps/site/public/icon-maskable-512.png", 512, 512, true),
  png("apps/site/public/og.png", 1200, 630, true),
  png("apps/mobile/assets/android-icon-foreground.png", 1024, 1024, false),
  png("apps/mobile/assets/android-icon-monochrome.png", 1024, 1024, false),
  png("apps/mobile/assets/splash-icon.png", 1024, 1024, false),
  png("apps/mobile/assets/favicon.png", 48, 48, false),
  png("apps/mobile/assets/logo-white.png", 147, 32, false),
  png("apps/mobile/assets/logo-white@2x.png", 295, 64, false),
  png("apps/mobile/assets/logo-white@3x.png", 442, 96, false),
  png("apps/mobile/assets/logo-green.png", 147, 32, false),
  png("apps/mobile/assets/logo-green@2x.png", 295, 64, false),
  png("apps/mobile/assets/logo-green@3x.png", 442, 96, false),
];

/** Drawn in `currentColor`, for inline use or as a CSS mask. */
const CURRENT_COLOUR_SVGS = [
  "apps/site/public/brand/logo.svg",
  "apps/site/public/brand/hand-1.svg",
  "apps/site/public/brand/hand-2.svg",
  "apps/site/public/brand/hand-3.svg",
];

const FIXED_COLOUR_SVGS = [
  { path: "apps/site/public/icon.svg", colours: [GREEN, WHITE] },
  { path: "apps/site/public/brand/logo-green.svg", colours: [GREEN] },
  { path: "apps/site/public/brand/logo-white.svg", colours: [WHITE] },
  { path: "apps/site/public/brand/logo-stacked-white.svg", colours: [WHITE] },
];

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("PNG outputs", () => {
  it.each(PNG_OUTPUTS)("$path is $width×$height", (expected) => {
    const header = readPngHeader(read(expected.path));
    expect({ width: header.width, height: header.height }).toEqual({
      width: expected.width,
      height: expected.height,
    });
    expect(header.colourType).toBe(
      expected.opaque ? PNG_COLOUR_TYPE.rgb : PNG_COLOUR_TYPE.rgba
    );
  });
});

describe("favicon.ico", () => {
  const entries = readIco(read("apps/site/public/favicon.ico"));

  it("holds exactly the 16, 32 and 48 pixel images", () => {
    expect(entries.map((entry) => [entry.width, entry.height])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ]);
  });

  it.each(
    entries
  )("stores the $width px image as a matching 32-bit PNG", (entry) => {
    expect(entry.bitsPerPixel).toBe(32);
    const header = readPngHeader(entry.data);
    expect([header.width, header.height]).toEqual([entry.width, entry.height]);
  });
});

describe("SVG outputs", () => {
  const all = [
    ...CURRENT_COLOUR_SVGS,
    ...FIXED_COLOUR_SVGS.map((svg) => svg.path),
  ];

  it.each(all)("%s is a well-formed <svg> with a viewBox", (path) => {
    const source = readFileSync(join(REPO_ROOT, path), "utf8");
    expect(source.startsWith("<svg")).toBe(true);
    const root = readXmlRoot(source);
    expect(root.get("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(root.get("viewBox")).toMatch(/^[\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
  });

  it.each(
    CURRENT_COLOUR_SVGS
  )("%s takes its colour from currentColor", (path) => {
    const source = readFileSync(join(REPO_ROOT, path), "utf8");
    expect(source).toContain('fill="currentColor"');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\bstyle=/);
    const paints = [...source.matchAll(/\b(?:fill|stroke)="([^"]*)"/g)].map(
      (match) => match[1]
    );
    expect(new Set(paints)).toEqual(new Set(["currentColor"]));
  });

  it.each(FIXED_COLOUR_SVGS)("$path is drawn in fixed colours", ({
    path,
    colours,
  }) => {
    const source = readFileSync(join(REPO_ROOT, path), "utf8");
    expect(source).not.toContain("currentColor");
    for (const colour of colours) {
      expect(source).toContain(colour);
    }
  });
});

describe("store icon", () => {
  it("is the icon the stores already ship, byte for byte", () => {
    for (const path of [
      "apps/mobile/assets/icon.png",
      "packages/brand/src/art/icon.png",
    ]) {
      const hash = createHash("sha256").update(read(path)).digest("hex");
      expect(hash, path).toBe(STORE_ICON_SHA256);
    }
  });

  it("is a 1024 px square", () => {
    const header = readPngHeader(read("apps/mobile/assets/icon.png"));
    expect([header.width, header.height]).toEqual([1024, 1024]);
  });
});

describe("iOS layered icon", () => {
  const source = join(ART_DIR, "smog.icon");
  const copy = join(REPO_ROOT, "apps/mobile/assets/smog.icon");

  it("is an exact copy of the source package", () => {
    const sourceFiles = filesUnder(source).map((path) =>
      relative(source, path)
    );
    const copiedFiles = filesUnder(copy).map((path) => relative(copy, path));
    expect(copiedFiles.sort()).toEqual(sourceFiles.sort());
    expect(sourceFiles).toContain("icon.json");
    for (const file of sourceFiles) {
      expect(
        readFileSync(join(copy, file)).equals(readFileSync(join(source, file))),
        file
      ).toBe(true);
    }
  });
});
