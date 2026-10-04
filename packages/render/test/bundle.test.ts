/**
 * The bundling smoke (phase 7 task 1, Minor 15): `@remotion/bundler`
 * resolves the workspace `.ts` packages through their `exports` and turns
 * the `.woff2` import into an emitted file and its URL, and Vite does the
 * same for the Player's build. Neither needs Chrome.
 */
import { afterAll, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { build } from "vite";
import { OVERLAY_FONT_FILES } from "../src/compositions/font";
import { RENDER_OVERLAY_LAYOUT, SPONSORED_VIDEO_ID } from "../src/contract";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const WOFF2 = /\.woff2$/;
/** The Player's runtime, left to the site's own build. */
const EXTERNAL = [/^react(\/|$)/, /^react-dom(\/|$)/, /^remotion(\/|$)/];
const BUNDLE_TIMEOUT_MS = 180_000;
/** A bundled `mediabunny` demuxer directory (`isobmff`, `matroska`, `ogg`, …). */
const MEDIABUNNY_DEMUXER =
  /\/\/#region \S*mediabunny\/dist\/modules\/src\/([a-z0-9-]+)\//g;

const dirs: string[] = [];

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

afterAll(async () => {
  await Promise.all(
    dirs.map((dir) => rm(dir, { force: true, recursive: true }))
  );
});

describe("the Remotion bundle of ./remotion", () => {
  it(
    "resolves the contract, the tokens and the font files",
    async () => {
      const outDir = await tempDir("smog-render-bundle-");
      const serveUrl = await bundle({
        enableCaching: false,
        entryPoint: join(PACKAGE_DIR, "src/remotion/index.ts"),
        outDir,
      });
      expect(serveUrl).toBe(outDir);

      const files = await filesUnder(outDir);
      const fonts = files.filter((file) => WOFF2.test(file));
      expect(fonts).toHaveLength(OVERLAY_FONT_FILES.length);

      const scripts = files.filter((file) => file.endsWith(".js"));
      const source = (
        await Promise.all(scripts.map((file) => readFile(file, "utf8")))
      ).join("\n");
      expect(source).toContain(SPONSORED_VIDEO_ID);
      expect(source).toContain(RENDER_OVERLAY_LAYOUT.text.intro);
      // The brand green came through `@smog/styles/tokens`.
      expect(source).toContain(RENDER_OVERLAY_LAYOUT.text.color);
      for (const font of fonts) {
        const name = font.slice(font.lastIndexOf("/") + 1);
        expect(source).toContain(name);
      }
    },
    BUNDLE_TIMEOUT_MS
  );
});

describe("the Vite build of ./composition (the Player's side)", () => {
  it(
    "emits the font files and references their URLs",
    async () => {
      const outDir = await tempDir("smog-render-vite-");
      await build({
        // An app build, as the site's (library mode inlines every asset).
        build: {
          emptyOutDir: true,
          outDir,
          rolldownOptions: {
            external: EXTERNAL,
            input: join(PACKAGE_DIR, "src/compositions/index.ts"),
            preserveEntrySignatures: "exports-only",
          },
        },
        configFile: false,
        logLevel: "silent",
        root: PACKAGE_DIR,
      });

      const files = await filesUnder(outDir);
      const fonts = files.filter((file) => WOFF2.test(file));
      expect(fonts).toHaveLength(OVERLAY_FONT_FILES.length);
      const source = (
        await Promise.all(
          files
            .filter((file) => file.endsWith(".js"))
            .map((file) => readFile(file, "utf8"))
        )
      ).join("\n");
      for (const font of fonts) {
        const name = font.slice(font.lastIndexOf("/") + 1);
        expect(source).toContain(name);
      }
    },
    BUNDLE_TIMEOUT_MS
  );
});

describe("the Vite build of ./metadata/mp4 (the Player's reader)", () => {
  it(
    "bundles the MP4 demuxer only (fix wave M-3)",
    async () => {
      const outDir = await tempDir("smog-render-mp4-");
      await build({
        build: {
          emptyOutDir: true,
          minify: false,
          outDir,
          rolldownOptions: {
            input: join(PACKAGE_DIR, "src/metadata/mp4.ts"),
            preserveEntrySignatures: "exports-only",
          },
        },
        configFile: false,
        logLevel: "silent",
        root: PACKAGE_DIR,
      });
      const source = (
        await Promise.all(
          (
            await filesUnder(outDir)
          )
            .filter((file) => file.endsWith(".js"))
            .map((file) => readFile(file, "utf8"))
        )
      ).join("\n");
      // Unminified, each module keeps its `//#region <path>` marker.
      const demuxers = new Set(
        [...source.matchAll(MEDIABUNNY_DEMUXER)].map((match) => match[1])
      );
      expect([...demuxers]).toEqual(["isobmff"]);
    },
    BUNDLE_TIMEOUT_MS
  );
});
