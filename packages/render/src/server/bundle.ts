/**
 * Builds the Remotion bundle of `./remotion` (phase 7 ruling 7): when the
 * image is built (`bun src/server/bundle.ts` → `RENDER_BUNDLE_DIR`), never
 * at request time as the old server did. `bun -F @smog/render serve`
 * builds it once into `.render-bundle/` when it is missing. Bun only;
 * `@remotion/bundler` is a devDependency, absent from the runtime image.
 */
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { parseRenderServerEnv } from "@smog/config/env/render";

const ENTRY_POINT = fileURLToPath(
  new URL("../remotion/index.ts", import.meta.url)
);
const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const PROGRESS_STEP = 25;

/** Bundles a Remotion entry (`./remotion` by default) into `outDir`. */
export async function buildBundle(
  outDir: string,
  entryPoint: string = ENTRY_POINT
): Promise<string> {
  const started = Date.now();
  let reported = 0;
  const serveUrl = await bundle({
    enableCaching: false,
    entryPoint,
    onProgress: (percent) => {
      if (percent >= reported + PROGRESS_STEP) {
        reported = percent - (percent % PROGRESS_STEP);
        console.log(`[render] bundling ${reported}%`);
      }
    },
    outDir,
    // The package root: there is no `public/` (the font is an import).
    rootDir: PACKAGE_DIR,
  });
  console.log(`[render] bundle ready in ${Date.now() - started} ms`);
  return serveUrl;
}

if (import.meta.main) {
  const { RENDER_BUNDLE_DIR } = parseRenderServerEnv(process.env);
  try {
    await buildBundle(RENDER_BUNDLE_DIR);
  } catch (error) {
    console.error("[render] Failed to build the bundle:", error);
    process.exit(1);
  }
}
