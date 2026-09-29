/**
 * The committed outputs against a fresh render of `brandPlan()`. The other
 * output tests check shapes (sizes, colour types, well-formed SVG); these
 * fail when the artwork, a layout constant or a token colour changed and
 * nobody ran `bun -F @smog/brand generate`.
 *
 * Rasters are compared as decoded RGBA pixels, not PNG bytes, so a different
 * zlib build cannot fail them. PIXEL_TOLERANCE allows librsvg's
 * anti-aliasing to differ by a hair between platforms; any real change
 * (a moved or recoloured mark) changes edge pixels by far more.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brandPlan, REPO_ROOT } from "./compose";
import { type Pixels, rgba } from "./raster";
import { readIco } from "./test-helpers";

/** Maximum per-channel difference (0–255) between committed and fresh. */
const PIXEL_TOLERANCE = 2;

const plan = brandPlan();

function committed(path: string): Buffer {
  return readFileSync(join(REPO_ROOT, path));
}

async function fresh(svg: string, opaque: boolean): Promise<Pixels> {
  const { rasterise } = await import("./raster");
  return rgba(await rasterise(svg, opaque));
}

interface Difference {
  maxChannelDelta: number;
  size: string;
}

function difference(actual: Pixels, expected: Pixels): Difference {
  const size = `${actual.width}×${actual.height}`;
  if (
    actual.width !== expected.width ||
    actual.height !== expected.height ||
    actual.data.length !== expected.data.length
  ) {
    return {
      maxChannelDelta: 255,
      size: `${size} (expected ${expected.width}×${expected.height})`,
    };
  }
  let maxChannelDelta = 0;
  for (let index = 0; index < actual.data.length; index += 1) {
    const delta = Math.abs(
      (actual.data[index] ?? 0) - (expected.data[index] ?? 0)
    );
    maxChannelDelta = Math.max(maxChannelDelta, delta);
  }
  return { maxChannelDelta, size };
}

describe("vector outputs equal the plan byte for byte", () => {
  it.each(plan.vectors.map((vector) => [vector.path, vector.contents]))(
    "%s",
    (path, contents) => {
      expect(committed(path).toString("utf8")).toBe(contents);
    }
  );
});

describe("raster outputs match a fresh render", () => {
  it.each(plan.rasters.map((raster) => [raster.path, raster]))(
    "%s",
    async (path, raster) => {
      const { opaque, svg } = raster as (typeof plan.rasters)[number];
      const result = difference(
        await rgba(committed(path)),
        await fresh(svg, opaque)
      );
      expect(result.maxChannelDelta).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    }
  );
});

describe("favicon.ico matches a fresh render", () => {
  const entries = readIco(new Uint8Array(committed(plan.favicon.path)));

  it("holds one image per planned size, in order", () => {
    expect(entries.map((entry) => entry.width)).toEqual(
      plan.favicon.images.map((image) => image.size)
    );
  });

  it.each(plan.favicon.images.map((image) => [image.size, image.svg]))(
    "%p px",
    async (size, svg) => {
      const entry = entries.find((candidate) => candidate.width === size);
      expect(entry).toBeDefined();
      const result = difference(
        await rgba(Buffer.from(entry?.data ?? new Uint8Array())),
        await fresh(svg as string, false)
      );
      expect(result.maxChannelDelta).toBeLessThanOrEqual(PIXEL_TOLERANCE);
    }
  );
});
