import { describe, expect, it } from "bun:test";
import {
  audioPath,
  createNearEndTracker,
  END_CARD_SECONDS,
  endCardStart,
  isEndCardVisible,
  muxStreamUrl,
  muxThumbnailUrl,
  NEAR_END_SECONDS,
  sponsorLogoPath,
} from "../../../../utils/src/media";

describe("audioPath", () => {
  it("serves an R2 key from the same-origin route", () => {
    expect(audioPath("audio/g1/nl/u1")).toBe("/api/audio/g1/nl/u1");
  });
});

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

describe("sponsorLogoPath", () => {
  it("serves an R2 logo key from the same-origin route", () => {
    expect(sponsorLogoPath("logos/0a1b")).toBe("/api/sponsor-logos/0a1b");
  });
});

describe("the sponsor end card window", () => {
  it("starts END_CARD_SECONDS before the end of a longer video", () => {
    expect(END_CARD_SECONDS).toBe(4);
    expect(endCardStart(20)).toBe(16);
    expect(endCardStart(8)).toBe(4);
  });

  it("never starts before the middle of a short video", () => {
    expect(endCardStart(6)).toBe(3);
    expect(endCardStart(3)).toBe(1.5);
  });

  it("has no window until the duration is known", () => {
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(endCardStart(duration)).toBeNull();
      expect(isEndCardVisible(1, duration)).toBe(false);
    }
  });

  it("shows from the start of the window to the end, and hides after a seek back", () => {
    expect(isEndCardVisible(15.9, 20)).toBe(false);
    expect(isEndCardVisible(16, 20)).toBe(true);
    expect(isEndCardVisible(20, 20)).toBe(true);
    expect(isEndCardVisible(2, 20)).toBe(false);
    expect(isEndCardVisible(Number.NaN, 20)).toBe(false);
  });
});
