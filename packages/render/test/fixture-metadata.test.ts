/**
 * The committed fixtures read over HTTP, as the server reads a Mux source
 * (`readSourceMetadata`) and the wizard's Player reads a rendition
 * (`readMp4Metadata`, MP4 only). No browser.
 * - `test/fixtures/source-2s.mp4` (9:16, made by `bun -F @smog/render
 *   fixture`; regenerate it only on purpose and commit the result);
 * - `test/fixtures/source-3x4-2s.mp4`, the shape of the gesture library
 *   (810 × 1080 scaled down to 360 × 480): `source-2s.mp4` cropped to
 *   3:4 with Remotion's ffmpeg (fix wave M-5, DECISIONS).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readSourceMetadata } from "../src/metadata";
import { readMp4Metadata } from "../src/metadata/mp4";
import { type LocalServer, serveFiles } from "./support/servers";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/source-2s.mp4", import.meta.url)
);
const FIXTURE_3X4 = fileURLToPath(
  new URL("./fixtures/source-3x4-2s.mp4", import.meta.url)
);
/** Ruling 15: "about 50 KB"; it must stay small enough to commit. */
const FIXTURE_MAX_BYTES = 100 * 1024;

let source: LocalServer;

beforeAll(() => {
  source = serveFiles({
    "/source-2s.mp4": FIXTURE,
    "/source-3x4-2s.mp4": FIXTURE_3X4,
  });
});

afterAll(async () => {
  await source.stop();
});

describe("the source fixture", () => {
  it("is a 2 s 360 × 640 clip of 60 frames", async () => {
    expect(await readSourceMetadata(`${source.url}/source-2s.mp4`)).toEqual({
      durationInFrames: 60,
      durationInSeconds: 2,
      height: 640,
      width: 360,
    });
  });

  it("has a 3:4 sibling of 360 × 480, the gesture library's shape", async () => {
    expect(await readSourceMetadata(`${source.url}/source-3x4-2s.mp4`)).toEqual(
      {
        durationInFrames: 60,
        durationInSeconds: 2,
        height: 480,
        width: 360,
      }
    );
  });

  it("reads the same through the Player's MP4-only reader", async () => {
    for (const name of ["source-2s.mp4", "source-3x4-2s.mp4"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one fixture at a time.
      expect(await readMp4Metadata(`${source.url}/${name}`)).toEqual(
        await readSourceMetadata(`${source.url}/${name}`)
      );
    }
  });

  it("is small", async () => {
    expect((await stat(FIXTURE)).size).toBeLessThan(FIXTURE_MAX_BYTES);
    expect((await stat(FIXTURE_3X4)).size).toBeLessThan(FIXTURE_MAX_BYTES);
  });

  it("a missing source is a retryable SourceFetchError (404)", async () => {
    await expect(
      readSourceMetadata(`${source.url}/missing.mp4`)
    ).rejects.toMatchObject({ retryable: true, status: 404 });
  });
});
