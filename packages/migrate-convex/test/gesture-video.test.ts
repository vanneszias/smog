import { describe, expect, test } from "bun:test";
import {
  type PlaybackSponsorship,
  resolveGesturePlayback,
  resolveGesturePlaybacks,
} from "../src/core/gesture-video";

const GESTURE = { _id: "g1", playbackId: "pb-current" };
const SHOWING_SPONSOR = { _id: "g1", playbackId: "pb-sponsor" };

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

function codes(result: ReturnType<typeof resolveGesturePlayback>): string[] {
  return result.warnings.map((warning) => warning.code);
}

describe("resolveGesturePlayback (B1)", () => {
  test("an active sponsorship's video on the gesture: the gesture's own video, no warning", () => {
    expect(resolveGesturePlayback(SHOWING_SPONSOR, [sponsorship({})])).toEqual({
      playbackId: "pb-own",
      restoredFrom: ["s1"],
      warnings: [],
    });
  });

  test("a missed restore (an expired sponsorship's video still on the gesture): restored, with a warning", () => {
    const result = resolveGesturePlayback(SHOWING_SPONSOR, [
      sponsorship({ status: "expired" }),
    ]);
    expect(result.playbackId).toBe("pb-own");
    expect(result.restoredFrom).toEqual(["s1"]);
    expect(result.warnings).toEqual([
      {
        code: "missedRestore",
        gestureId: "g1",
        message:
          "Gesture g1 still showed the video of expired sponsorship s1; its own video is restored.",
        sponsorshipId: "s1",
      },
    ]);
  });

  test("the video changed during an active sponsorship: kept, with a warning", () => {
    const result = resolveGesturePlayback(GESTURE, [sponsorship({})]);
    expect(result.playbackId).toBe("pb-current");
    expect(result.restoredFrom).toEqual([]);
    expect(codes(result)).toEqual(["changedDuringSponsorship"]);
    expect(result.warnings[0]?.sponsorshipId).toBe("s1");
  });

  test("no sponsorship, or none that touched the video: kept, no warning", () => {
    const kept = { playbackId: "pb-current", restoredFrom: [], warnings: [] };
    expect(resolveGesturePlayback(GESTURE, [])).toEqual(kept);
    // Another gesture's sponsorship is ignored.
    expect(
      resolveGesturePlayback(GESTURE, [
        sponsorship({
          gestureId: "g2",
          sponsoredVideoPlaybackId: "pb-current",
        }),
      ])
    ).toEqual(kept);
    // An expired one whose original differs (the admin changed it after the expiry).
    expect(
      resolveGesturePlayback(GESTURE, [sponsorship({ status: "expired" })])
    ).toEqual(kept);
    // A pending one without a sponsored video.
    expect(
      resolveGesturePlayback(GESTURE, [
        sponsorship({
          originalVideoPlaybackId: "pb-current",
          sponsoredVideoPlaybackId: undefined,
          status: "pending_payment",
        }),
      ])
    ).toEqual(kept);
  });

  test("the active match wins over a missed restore, and the newest decides among equals", () => {
    const rows = [
      sponsorship({
        _id: "old",
        originalVideoPlaybackId: "pb-older",
        sponsoredVideoPlaybackId: "pb-old-sponsor",
        status: "expired",
      }),
      sponsorship({ _creationTime: 200, _id: "live" }),
    ];
    expect(resolveGesturePlayback(SHOWING_SPONSOR, rows)).toEqual({
      playbackId: "pb-own",
      restoredFrom: ["live"],
      warnings: [],
    });
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
    expect(resolveGesturePlayback(SHOWING_SPONSOR, missed).playbackId).toBe(
      "pb-b"
    );
  });

  test("follows the chain after a rejected active sponsorship and a new one (I2)", () => {
    // A was active (the gesture showed A's video), then rejected without a
    // restore; B was created then, so B's original is A's sponsored video;
    // B was approved and shows B's video now.
    const rows = [
      sponsorship({
        _creationTime: 100,
        _id: "A",
        originalVideoPlaybackId: "pb-own",
        sponsoredVideoPlaybackId: "pb-A",
        status: "rejected",
      }),
      sponsorship({
        _creationTime: 200,
        _id: "B",
        originalVideoPlaybackId: "pb-A",
        sponsoredVideoPlaybackId: "pb-B",
        status: "active",
      }),
    ];
    const result = resolveGesturePlayback(
      { _id: "g1", playbackId: "pb-B" },
      rows
    );
    expect(result.playbackId).toBe("pb-own");
    expect(result.restoredFrom).toEqual(["B", "A"]);
    expect(codes(result)).toEqual(["chainedRestore"]);
    expect(result.warnings[0]?.sponsorshipId).toBe("A");
  });

  test("a chain through a preview video is followed too", () => {
    const rows = [
      sponsorship({
        _creationTime: 100,
        _id: "A",
        originalVideoPlaybackId: "pb-own",
        previewVideoPlaybackId: "pb-preview",
        sponsoredVideoPlaybackId: undefined,
        status: "rejected",
      }),
      sponsorship({
        _creationTime: 200,
        _id: "B",
        originalVideoPlaybackId: "pb-preview",
        sponsoredVideoPlaybackId: "pb-B",
      }),
    ];
    expect(
      resolveGesturePlayback({ _id: "g1", playbackId: "pb-B" }, rows).playbackId
    ).toBe("pb-own");
  });

  test("stops at a cycle and warns that the result is still a sponsor's video", () => {
    const rows = [
      sponsorship({
        _creationTime: 100,
        _id: "A",
        originalVideoPlaybackId: "pb-B",
        sponsoredVideoPlaybackId: "pb-A",
        status: "rejected",
      }),
      sponsorship({
        _creationTime: 200,
        _id: "B",
        originalVideoPlaybackId: "pb-A",
        sponsoredVideoPlaybackId: "pb-B",
      }),
    ];
    const result = resolveGesturePlayback(
      { _id: "g1", playbackId: "pb-B" },
      rows
    );
    expect(result.restoredFrom).toEqual(["B", "A"]);
    expect(result.playbackId).toBe("pb-B");
    expect(codes(result)).toEqual([
      "chainedRestore",
      "restoreEndsInSponsorVideo",
    ]);
  });

  test("resolveGesturePlaybacks resolves every gesture", () => {
    const map = resolveGesturePlaybacks(
      [SHOWING_SPONSOR, { _id: "g2", playbackId: "pb-two" }],
      [sponsorship({})]
    );
    expect(map.get("g1")?.playbackId).toBe("pb-own");
    expect(map.get("g2")).toEqual({
      playbackId: "pb-two",
      restoredFrom: [],
      warnings: [],
    });
  });
});
