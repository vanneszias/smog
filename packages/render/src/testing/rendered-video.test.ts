import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { checkRenderedVideo, readRenderedVideo } from "./rendered-video";

const FIXTURES = fileURLToPath(
  new URL("../../test/fixtures/", import.meta.url)
);

describe("checkRenderedVideo", () => {
  const SOURCE = { frames: 60, height: 640, width: 360 };

  it("passes an H.264 file at the source's size and frame count", () => {
    expect(
      checkRenderedVideo(
        { codec: "avc", frames: 61, height: 640, width: 360 },
        SOURCE
      )
    ).toEqual([]);
  });

  it("names every difference", () => {
    expect(
      checkRenderedVideo(
        { codec: "vp9", frames: 30, height: 360, width: 640 },
        SOURCE
      )
    ).toEqual([
      "codec vp9, expected avc (H.264)",
      "size 640 × 360, expected 360 × 640",
      "30 frames, expected 60 ± 1",
    ]);
  });

  it("refuses a file without a video track", () => {
    expect(checkRenderedVideo(null, SOURCE)).toEqual(["no video track"]);
  });
});

describe("readRenderedVideo", () => {
  it("reads the codec, the size and the frames of the fixtures", async () => {
    const tall = await readRenderedVideo(
      await readFile(`${FIXTURES}source-2s.mp4`)
    );
    expect(tall).toEqual({ codec: "avc", frames: 60, height: 640, width: 360 });
    const library = await readRenderedVideo(
      await readFile(`${FIXTURES}source-3x4-2s.mp4`)
    );
    expect(library).toEqual({
      codec: "avc",
      frames: 60,
      height: 480,
      width: 360,
    });
  });
});
