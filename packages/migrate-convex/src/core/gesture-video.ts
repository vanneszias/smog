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
 *    warning;
 * 3. otherwise, an `active` sponsorship whose `originalVideoPlaybackId`
 *    differs from the gesture's `playbackId` (the admin changed the video
 *    during the sponsorship): the gesture keeps its `playbackId`, with a
 *    warning;
 * 4. otherwise (no sponsorship, or nothing that touched the video): the
 *    gesture keeps its `playbackId`.
 *
 * When several sponsorships match a case, the newest (`_creationTime`,
 * then `_id`) decides. This is the one copy of the rule: the catalogue
 * transform (task 7) and `mux renditions` (task 9) both call it.
 */
import type { GestureRow, SponsorshipRow } from "./export-schema";

export type GesturePlaybackWarningCode =
  | "missedRestore"
  | "changedDuringSponsorship";

export interface GesturePlaybackWarning {
  readonly code: GesturePlaybackWarningCode;
  readonly gestureId: string;
  /** One sentence with ids only. */
  readonly message: string;
  readonly sponsorshipId: string;
}

export interface GesturePlayback {
  readonly playbackId: string;
  /** The sponsorship whose `originalVideoPlaybackId` was restored, if any. */
  readonly restoredFrom?: string;
  readonly warning?: GesturePlaybackWarning;
}

export type PlaybackGesture = Pick<GestureRow, "_id" | "playbackId">;
export type PlaybackSponsorship = Pick<
  SponsorshipRow,
  | "_creationTime"
  | "_id"
  | "gestureId"
  | "originalVideoPlaybackId"
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
  const showsSponsor = (row: PlaybackSponsorship): boolean =>
    row.sponsoredVideoPlaybackId !== undefined &&
    row.sponsoredVideoPlaybackId === gesture.playbackId;
  const active = own.filter((row) => row.status === "active");

  const live = active.find(showsSponsor);
  if (live) {
    return {
      playbackId: live.originalVideoPlaybackId,
      restoredFrom: live._id,
    };
  }
  const missed = own.find(showsSponsor);
  if (missed) {
    return {
      playbackId: missed.originalVideoPlaybackId,
      restoredFrom: missed._id,
      warning: {
        code: "missedRestore",
        gestureId: gesture._id,
        message: `Gesture ${gesture._id} still showed the video of ${missed.status} sponsorship ${missed._id}; its own video is restored.`,
        sponsorshipId: missed._id,
      },
    };
  }
  const changed = active.find(
    (row) => row.originalVideoPlaybackId !== gesture.playbackId
  );
  if (changed) {
    return {
      playbackId: gesture.playbackId,
      warning: {
        code: "changedDuringSponsorship",
        gestureId: gesture._id,
        message: `Gesture ${gesture._id} shows neither the sponsored nor the original video of active sponsorship ${changed._id} (changed during the sponsorship); its current video is kept.`,
        sponsorshipId: changed._id,
      },
    };
  }
  return { playbackId: gesture.playbackId };
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
