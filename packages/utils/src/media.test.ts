import { describe, expect, it } from "bun:test";
import {
  createNearEndTracker,
  muxStreamUrl,
  muxThumbnailUrl,
  NEAR_END_SECONDS,
} from "./media";

describe("mux urls", () => {
  it("builds the HLS stream url", () => {
    expect(muxStreamUrl("abc123")).toBe("https://stream.mux.com/abc123.m3u8");
  });

  it("builds a thumbnail url with an optional width and time", () => {
    expect(muxThumbnailUrl("abc")).toBe(
      "https://image.mux.com/abc/thumbnail.webp"
    );
    expect(muxThumbnailUrl("abc", { time: 1.5, width: 480 })).toBe(
      "https://image.mux.com/abc/thumbnail.webp?width=480&time=1.5"
    );
  });

  it("encodes the playback id", () => {
    expect(muxStreamUrl("a/b")).toBe("https://stream.mux.com/a%2Fb.m3u8");
  });
});

describe("createNearEndTracker", () => {
  it("fires once when 5 s or less are left", () => {
    expect(NEAR_END_SECONDS).toBe(5);
    const tracker = createNearEndTracker();
    expect(tracker.update(1, 20)).toBe(false);
    expect(tracker.update(14.9, 20)).toBe(false);
    expect(tracker.update(15, 20)).toBe(true);
    expect(tracker.update(17, 20)).toBe(false);
    expect(tracker.update(20, 20)).toBe(false);
  });

  it("fires again on the next loop, when time jumps back", () => {
    const tracker = createNearEndTracker();
    expect(tracker.update(16, 20)).toBe(true);
    expect(tracker.update(0.2, 20)).toBe(false);
    expect(tracker.update(16, 20)).toBe(true);
  });

  it("reset() re-arms it (an ended video that is played again)", () => {
    const tracker = createNearEndTracker();
    expect(tracker.update(19, 20)).toBe(true);
    tracker.reset();
    expect(tracker.update(19, 20)).toBe(true);
  });

  it("ignores an unknown or zero duration", () => {
    const tracker = createNearEndTracker();
    expect(tracker.update(0, 0)).toBe(false);
    expect(tracker.update(0, Number.NaN)).toBe(false);
    expect(tracker.update(3, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("a video shorter than the threshold fires at its start", () => {
    const tracker = createNearEndTracker();
    expect(tracker.update(0, 4)).toBe(true);
    expect(tracker.update(2, 4)).toBe(false);
  });
});
