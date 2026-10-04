/**
 * The committed fixture `test/fixtures/source-2s.mp4` (made by
 * `bun -F @smog/render fixture`; regenerate it only on purpose and commit
 * the result) read through `readSourceMetadata` over HTTP, as the server
 * reads a Mux source. No browser.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readSourceMetadata } from "../src/metadata";
import { type LocalServer, serveFiles } from "./support/servers";

const FIXTURE = fileURLToPath(
  new URL("./fixtures/source-2s.mp4", import.meta.url)
);
/** Ruling 15: "about 50 KB"; it must stay small enough to commit. */
const FIXTURE_MAX_BYTES = 100 * 1024;

let source: LocalServer;

beforeAll(() => {
  source = serveFiles({ "/source-2s.mp4": FIXTURE });
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

  it("is small", async () => {
    expect((await stat(FIXTURE)).size).toBeLessThan(FIXTURE_MAX_BYTES);
  });

  it("a missing source is a retryable SourceFetchError (404)", async () => {
    await expect(
      readSourceMetadata(`${source.url}/missing.mp4`)
    ).rejects.toMatchObject({ retryable: true, status: 404 });
  });
});
