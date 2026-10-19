/**
 * `bun -F @smog/render fixture`: renders `test/fixtures/source-2s.mp4`
 * (phase 7 ruling 15), a 2 s 360 × 640 H.264 test card from
 * `fixture-card.tsx`, with the server's own renderer settings. The render
 * lane's source, the metadata test and the wizard's e2e use it. Run it
 * again only to change the fixture (it needs a browser: set
 * `RENDER_BROWSER_EXECUTABLE`, or Remotion downloads its own), then commit
 * the file.
 */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { buildBundle } from "./bundle";

export const FIXTURE_PATH = fileURLToPath(
  new URL("../../test/fixtures/source-2s.mp4", import.meta.url)
);
const CARD_ENTRY = fileURLToPath(
  new URL("./fixture-card.tsx", import.meta.url)
);
/** A higher CRF than the render's default keeps the file small (≈ 50 KB). */
const FIXTURE_CRF = 30;

if (import.meta.main) {
  const browserExecutable = process.env.RENDER_BROWSER_EXECUTABLE || null;
  const outDir = await mkdtemp(join(tmpdir(), "smog-render-fixture-"));
  try {
    const serveUrl = await buildBundle(outDir, CARD_ENTRY);
    const composition = await selectComposition({
      browserExecutable,
      id: "FixtureCard",
      serveUrl,
    });
    await renderMedia({
      browserExecutable,
      chromiumOptions: { enableMultiProcessOnLinux: true },
      codec: "h264",
      composition,
      crf: FIXTURE_CRF,
      imageFormat: "jpeg",
      outputLocation: FIXTURE_PATH,
      overwrite: true,
      serveUrl,
    });
    const { size } = await stat(FIXTURE_PATH);
    console.log(`[render] fixture written (${size} bytes): ${FIXTURE_PATH}`);
  } catch (error) {
    console.error("[render] Failed to render the fixture:", error);
    process.exitCode = 1;
  } finally {
    await rm(outDir, { force: true, recursive: true });
  }
}
