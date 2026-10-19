/**
 * Each sponsored gesture gets its own video back (phase 8 ruling 9, B1).
 *
 * The old `approve` and `updateAfterPayment` wrote the sponsored video into
 * `gestures.playbackId`, and the expiry restored `originalVideoPlaybackId`.
 * The new model never writes a sponsor's video into `gesture.playback_id`
 * (spec §5.2): the gesture keeps its own video and a live sponsorship's
 * video is served beside it. So the import reads the export's sponsorship
 * rows for the gesture:
 * 1. an `active` sponsorship (it maps to `live` or `expiring`) whose
 *    `sponsoredVideoPlaybackId` is the gesture's `playbackId`: the gesture
 *    gets that sponsorship's `originalVideoPlaybackId`;
 * 2. otherwise, any other sponsorship whose `sponsoredVideoPlaybackId` is
 *    the gesture's `playbackId` (a missed restore): the same, with a
 *    `missedRestore` warning;
 * 3. otherwise, an `active` sponsorship whose `originalVideoPlaybackId`
 *    differs from the gesture's `playbackId` (the admin changed the video
 *    during the sponsorship): the gesture keeps its `playbackId`, with a
 *    `changedDuringSponsorship` warning;
 * 4. otherwise (no sponsorship, or nothing that touched the video): the
 *    gesture keeps its `playbackId`.
 *
 * **Chains (task 5 review I2).** A sponsorship copies the gesture's video
 * as its `originalVideoPlaybackId` when it is created, and the old `reject`
 * never restored the gesture. So after "A active, A rejected, B created"
 * B's original is A's sponsored video. While the result is another
 * sponsorship's `sponsoredVideoPlaybackId` (or `previewVideoPlaybackId`),
 * the rule follows that sponsorship's `originalVideoPlaybackId`, with a
 * `chainedRestore` warning. A cycle stops the walk, and a result that is
 * still a sponsor's video then warns `restoreEndsInSponsorVideo` (the
 * owner sets that gesture's video by hand).
 *
 * When several sponsorships match a step, the newest (`_creationTime`,
 * then `_id`) decides. This is the one copy of the rule: the catalogue
 * transform (task 7) and `mux renditions` (task 9) both call it.
 */
import type { GestureRow, SponsorshipRow } from "./export-schema";

export type GesturePlaybackWarningCode =
  | "missedRestore"
  | "changedDuringSponsorship"
  | "chainedRestore"
  | "restoreEndsInSponsorVideo";

export interface GesturePlaybackWarning {
  readonly code: GesturePlaybackWarningCode;
  readonly gestureId: string;
  /** One sentence with ids only. */
  readonly message: string;
  readonly sponsorshipId: string;
}

export interface GesturePlayback {
  readonly playbackId: string;
  /** The sponsorships whose `originalVideoPlaybackId` was followed, in order. */
  readonly restoredFrom: readonly string[];
  /** Every warning, in the order the rule met them (empty for none). */
  readonly warnings: readonly GesturePlaybackWarning[];
}

export type PlaybackGesture = Pick<GestureRow, "_id" | "playbackId">;
export type PlaybackSponsorship = Pick<
  SponsorshipRow,
  | "_creationTime"
  | "_id"
  | "gestureId"
  | "originalVideoPlaybackId"
  | "previewVideoPlaybackId"
  | "sponsoredVideoPlaybackId"
  | "status"
>;

function newestFirst(a: PlaybackSponsorship, b: PlaybackSponsorship): number {
  if (a._creationTime !== b._creationTime) {
    return b._creationTime - a._creationTime;
  }
  if (a._id === b._id) {
    return 0;
  }
  return a._id < b._id ? 1 : -1;
}

function showsSponsor(row: PlaybackSponsorship, playbackId: string): boolean {
  return (
    row.sponsoredVideoPlaybackId === playbackId ||
    row.previewVideoPlaybackId === playbackId
  );
}

interface FirstStep {
  playbackId: string;
  restoredFrom: string[];
  warnings: GesturePlaybackWarning[];
}

/** Cases 1–4 of the module comment. */
function firstStep(
  gesture: PlaybackGesture,
  own: readonly PlaybackSponsorship[]
): FirstStep {
  const isSponsored = (row: PlaybackSponsorship): boolean =>
    row.sponsoredVideoPlaybackId === gesture.playbackId;
  const active = own.filter((row) => row.status === "active");
  const live = active.find(isSponsored);
  if (live) {
    return {
      playbackId: live.originalVideoPlaybackId,
      restoredFrom: [live._id],
      warnings: [],
    };
  }
  const missed = own.find(isSponsored);
  if (missed) {
    return {
      playbackId: missed.originalVideoPlaybackId,
      restoredFrom: [missed._id],
      warnings: [
        {
          code: "missedRestore",
          gestureId: gesture._id,
          message: `Gesture ${gesture._id} still showed the video of ${missed.status} sponsorship ${missed._id}; its own video is restored.`,
          sponsorshipId: missed._id,
        },
      ],
    };
  }
  const changed = active.find(
    (row) => row.originalVideoPlaybackId !== gesture.playbackId
  );
  if (changed) {
    return {
      playbackId: gesture.playbackId,
      restoredFrom: [],
      warnings: [
        {
          code: "changedDuringSponsorship",
          gestureId: gesture._id,
          message: `Gesture ${gesture._id} shows neither the sponsored nor the original video of active sponsorship ${changed._id} (changed during the sponsorship); its current video is kept.`,
          sponsorshipId: changed._id,
        },
      ],
    };
  }
  return { playbackId: gesture.playbackId, restoredFrom: [], warnings: [] };
}

/**
 * The playback id the migrated gesture gets, from the export's sponsorship
 * rows (all of them, or only the gesture's: rows of other gestures are
 * ignored).
 */
export function resolveGesturePlayback(
  gesture: PlaybackGesture,
  sponsorshipRows: readonly PlaybackSponsorship[]
): GesturePlayback {
  const own = sponsorshipRows
    .filter((row) => row.gestureId === gesture._id)
    .sort(newestFirst);
  const step = firstStep(gesture, own);
  const followed = new Set(step.restoredFrom);
  let { playbackId } = step;
  for (;;) {
    const current = playbackId;
    const next = own.find(
      (row) => !followed.has(row._id) && showsSponsor(row, current)
    );
    if (!next) {
      break;
    }
    followed.add(next._id);
    step.restoredFrom.push(next._id);
    step.warnings.push({
      code: "chainedRestore",
      gestureId: gesture._id,
      message: `Gesture ${gesture._id}: the restored video is sponsorship ${next._id}'s; its original video is followed instead.`,
      sponsorshipId: next._id,
    });
    playbackId = next.originalVideoPlaybackId;
  }
  const stillSponsor = own.find((row) => showsSponsor(row, playbackId));
  if (stillSponsor) {
    step.warnings.push({
      code: "restoreEndsInSponsorVideo",
      gestureId: gesture._id,
      message: `Gesture ${gesture._id}: following the original videos ends in sponsorship ${stillSponsor._id}'s video (a cycle); set this gesture's video by hand.`,
      sponsorshipId: stillSponsor._id,
    });
  }
  return {
    playbackId,
    restoredFrom: step.restoredFrom,
    warnings: step.warnings,
  };
}

/** `resolveGesturePlayback` for every gesture, by gesture `_id`. */
export function resolveGesturePlaybacks(
  gestures: readonly PlaybackGesture[],
  sponsorshipRows: readonly PlaybackSponsorship[]
): Map<string, GesturePlayback> {
  const byGesture = new Map<string, PlaybackSponsorship[]>();
  for (const row of sponsorshipRows) {
    const rows = byGesture.get(row.gestureId) ?? [];
    rows.push(row);
    byGesture.set(row.gestureId, rows);
  }
  return new Map(
    gestures.map((gesture) => [
      gesture._id,
      resolveGesturePlayback(gesture, byGesture.get(gesture._id) ?? []),
    ])
  );
}
