/**
 * Regenerates every icon and logo the site and the mobile app ship from the
 * artwork in `src/art`, following the plan in `src/compose.ts`. The outputs
 * are committed; builds never run this, so run it again
 * (`bun -F @smog/brand generate`) after changing the artwork or the plan.
 * Output is deterministic: the same sources give the same bytes, and
 * `src/outputs.test.ts` fails when the committed files drift from the plan.
 */

import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ART_DIR, brandPlan, REPO_ROOT } from "../src/compose";
import { encodeIco } from "../src/ico";
import { rasterise } from "../src/raster";
import { renderSvgModule } from "../src/svg-module";

const MOBILE_ASSETS = join(REPO_ROOT, "apps/mobile/assets");

function write(path: string, contents: string | Uint8Array): void {
  const target = join(REPO_ROOT, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

async function main(): Promise<void> {
  const plan = brandPlan();

  const icoImages = await Promise.all(
    plan.favicon.images.map(async ({ size, svg }) => ({
      png: await rasterise(svg, false),
      size,
    }))
  );
  write(plan.favicon.path, encodeIco(icoImages));

  await Promise.all(
    plan.rasters.map(async ({ opaque, path, svg }) => {
      write(path, await rasterise(svg, opaque));
    })
  );

  for (const { contents, path } of plan.vectors) {
    write(path, contents);
  }

  // The iOS 26 layered icon is an Icon Composer package, copied as is
  // (replaced whole, so a removed layer does not linger in the copy).
  rmSync(join(MOBILE_ASSETS, "smog.icon"), { force: true, recursive: true });
  cpSync(join(ART_DIR, "smog.icon"), join(MOBILE_ASSETS, "smog.icon"), {
    recursive: true,
  });

  write("packages/brand/src/svg.gen.ts", renderSvgModule(ART_DIR));
}

try {
  await main();
} catch (error) {
  console.error("[brand] Failed to generate the brand assets:", error);
  throw error;
}
