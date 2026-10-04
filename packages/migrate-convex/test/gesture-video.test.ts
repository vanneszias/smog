import { describe, expect, test } from "bun:test";
import {
  type PlaybackSponsorship,
  resolveGesturePlayback,
  resolveGesturePlaybacks,
} from "../src/core/gesture-video";

const GESTURE = { _id: "g1", playbackId: "pb-current" };

function sponsorship(
  overrides: Partial<PlaybackSponsorship>
): PlaybackSponsorship {
  return {
    _creationTime: 100,
    _id: "s1",
    gestureId: "g1",
    originalVideoPlaybackId: "pb-own",
    sponsoredVideoPlaybackId: "pb-sponsor",
    status: "active",
    ...overrides,
  };
}

describe("resolveGesturePlayback (B1)", () => {
  test("an active sponsorship's video on the gesture: the gesture's own video, no warning", () => {
    const result = resolveGesturePlayback(
      { _id: "g1", playbackId: "pb-sponsor" },
      [sponsorship({})]
    );
    expect(result).toEqual({ playbackId: "pb-own", restoredFrom: "s1" });
  });

  test("a missed restore (an expired sponsorship's video still on the gesture): restored, with a warning", () => {
    const result = resolveGesturePlayback(
      { _id: "g1", playbackId: "pb-sponsor" },
      [sponsorship({ status: "expired" })]
    );
    expect(result.playbackId).toBe("pb-own");
    expect(result.restoredFrom).toBe("s1");
    expect(result.warning).toEqual({
      code: "missedRestore",
      gestureId: "g1",
      message:
        "Gesture g1 still showed the video of expired sponsorship s1; its own video is restored.",
      sponsorshipId: "s1",
    });
  });

  test("the video changed during an active sponsorship: kept, with a warning", () => {
    const result = resolveGesturePlayback(GESTURE, [sponsorship({})]);
    expect(result.playbackId).toBe("pb-current");
    expect(result.restoredFrom).toBeUndefined();
    expect(result.warning?.code).toBe("changedDuringSponsorship");
    expect(result.warning?.sponsorshipId).toBe("s1");
  });

  test("no sponsorship, or none that touched the video: kept, no warning", () => {
    expect(resolveGesturePlayback(GESTURE, [])).toEqual({
      playbackId: "pb-current",
    });
    // Another gesture's sponsorship is ignored.
    expect(
      resolveGesturePlayback(GESTURE, [
        sponsorship({
          gestureId: "g2",
          sponsoredVideoPlaybackId: "pb-current",
        }),
      ])
    ).toEqual({ playbackId: "pb-current" });
    // An expired one whose original differs (the admin changed it after the expiry).
    expect(
      resolveGesturePlayback(GESTURE, [sponsorship({ status: "expired" })])
    ).toEqual({ playbackId: "pb-current" });
    // A pending one without a sponsored video.
    expect(
      resolveGesturePlayback(GESTURE, [
        sponsorship({
          originalVideoPlaybackId: "pb-current",
          sponsoredVideoPlaybackId: undefined,
          status: "pending_payment",
        }),
      ])
    ).toEqual({ playbackId: "pb-current" });
  });

  test("the active match wins over a missed restore, and the newest decides among equals", () => {
    const rows = [
      sponsorship({
        _id: "old",
        originalVideoPlaybackId: "pb-older",
        status: "expired",
      }),
      sponsorship({ _creationTime: 200, _id: "live" }),
    ];
    expect(
      resolveGesturePlayback({ _id: "g1", playbackId: "pb-sponsor" }, rows)
    ).toEqual({ playbackId: "pb-own", restoredFrom: "live" });
    const missed = [
      sponsorship({
        _creationTime: 50,
        _id: "a",
        originalVideoPlaybackId: "pb-a",
        status: "expired",
      }),
      sponsorship({
        _creationTime: 60,
        _id: "b",
        originalVideoPlaybackId: "pb-b",
        status: "rejected",
      }),
    ];
    expect(
      resolveGesturePlayback({ _id: "g1", playbackId: "pb-sponsor" }, missed)
        .playbackId
    ).toBe("pb-b");
  });

  test("resolveGesturePlaybacks resolves every gesture", () => {
    const map = resolveGesturePlaybacks(
      [
        { _id: "g1", playbackId: "pb-sponsor" },
        { _id: "g2", playbackId: "pb-two" },
      ],
      [sponsorship({})]
    );
    expect(map.get("g1")?.playbackId).toBe("pb-own");
    expect(map.get("g2")).toEqual({ playbackId: "pb-two" });
  });
});
