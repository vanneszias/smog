import { describe, expect, it } from "bun:test";
import {
  checkRenderedVideo,
  cookieHeader,
  renderAssetOf,
} from "./render-local-loop";

describe("cookieHeader", () => {
  it("keeps each cookie's name and value, without attributes", () => {
    expect(
      cookieHeader([
        "better-auth.session_token=abc.def; Path=/; HttpOnly; SameSite=Lax",
        "smog_mx=1; Max-Age=60",
      ])
    ).toBe("better-auth.session_token=abc.def; smog_mx=1");
  });

  it("is empty without cookies", () => {
    expect(cookieHeader([])).toBe("");
  });
});

describe("renderAssetOf", () => {
  const asset = (passthrough: string | null, status = "ready") => ({
    file: new Uint8Array([1]),
    id: `asset-${passthrough}`,
    passthrough,
    playbackId: "p",
    status,
  });

  it("finds the job's ready render asset", () => {
    const found = renderAssetOf(
      [asset(null), asset("render-job:other"), asset("render-job:job-1")],
      "job-1"
    );
    expect(found?.id).toBe("asset-render-job:job-1");
  });

  it("ignores a gesture upload and an asset that is not ready", () => {
    expect(
      renderAssetOf(
        [asset("gesture-upload:job-1"), asset("render-job:job-1", "errored")],
        "job-1"
      )
    ).toBeNull();
  });
});

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
