import type { CollectionBeforeChangeHook } from "payload";
import type { Sponsorship } from "@/payload-types";

/**
 * The two hooks that decide whether a composited video reaches a public page,
 * and whether the one that reaches it is of the overlay somebody approved.
 *
 * ## Three columns, and why they are three
 *
 * `originalVideoPlaybackId` is the gesture's own video, kept so expiry can put
 * it back. `previewVideoPlaybackId` is what Remotion Lambda composed, written
 * by `POST /api/render/callback`; nothing public reads it, and the sponsor's
 * review page plays it. `sponsoredVideoPlaybackId` is the one
 * `lib/sponsorOverlay.ts` puts on the gesture page.
 *
 * The copy from the second to the third is made here, on approval, and that is
 * the whole of "a person is in between": no callback, however well signed, can
 * put a video on a public page without an administrator.
 *
 * ## Why `invalidateComposedVideo` exists
 *
 * A composite has the sponsor's words and logo burned into the frame, so it is
 * only ever a composite of *one* version of the overlay. And a sponsorship's
 * overlay can change after one has been made:
 * `rejected -> pending_resubmission` is a legal move
 * (`lib/sponsorshipStatus.ts`: an administrator may re-open a rejected
 * sponsorship), so a row can carry a composite made before a rejection and come
 * back through the approval queue with different text and a different logo.
 *
 * Copying blindly on approval would then put the *rejected* submission's video
 * live the moment the re-edit is approved, with the sponsor's correction
 * visible nowhere but the database. So a write that changes the overlay throws
 * the composite away.
 *
 * That is a fact about the content rather than about whoever changed it, which
 * is why it is a hook and not a line in `endpoints/sponsorships.ts`: the
 * re-edit form and an administrator editing the text in the admin panel both
 * pass through here. **Order matters** — invalidation runs first, so a single
 * save that both fixes the text and approves cannot publish the video of the
 * text it just replaced.
 *
 * ## What these hooks are not
 *
 * They are not a second line of defence behind `enforceStatusTransitions`.
 * That hook compares `originalDoc.status` with `data.status` and allows
 * `from === to`, so it has nothing to say about a write that changes only a
 * playback id — `endpoints/render.int.test.ts` proves exactly that against a
 * cancelled sponsorship. Hooks rather than access rules for the reason
 * `enforceStatusTransitions` documents: every server-side writer runs with
 * `overrideAccess: true`, so a guard the access layer could bypass is a guard
 * none of them is subject to.
 *
 * ## One thing these deliberately do not do
 *
 * An overlay changed on an **already active** sponsorship leaves
 * `sponsoredVideoPlaybackId` alone, so the public page keeps playing a
 * composite of the old words until something replaces it. Clearing it would
 * silently swap a running sponsor's video for the unsponsored original, which
 * is a bigger change to make from a hook than a stale caption is to leave. It
 * is recorded here rather than hidden: the proper answer is a re-render.
 */

/** A relationship's id, whatever depth the document came back at. */
function uploadId(value: Sponsorship["overlayImage"]): null | number {
  if (typeof value === "object" && value !== null) {
    return value.id;
  }

  return value ?? null;
}

/** A playback id that is really there, treating `""` as absent. */
function playbackId(value: null | string | undefined): null | string {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Throws away a composite of an overlay that has just been replaced.
 *
 * `data` is the whole merged document by the time a collection `beforeChange`
 * runs — `fields/hooks/beforeValidate/promise.js` (3.89.0) fills every absent
 * field from `originalDoc` — so an update that mentions neither column still
 * arrives carrying both, and the comparison below is between what is being
 * saved and what is stored rather than between a patch and a document. That is
 * also why this cannot simply clear the column on every update: the render
 * callback's own write sets the preview and nothing else, and clearing it here
 * would mean no render ever survived its own callback.
 */
export const invalidateComposedVideo: CollectionBeforeChangeHook<
  Sponsorship
> = ({ data, operation, originalDoc }) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const textChanged =
    data.overlayText !== undefined &&
    data.overlayText !== originalDoc.overlayText;
  const logoChanged =
    uploadId(data.overlayImage) !== uploadId(originalDoc.overlayImage);

  if (!(textChanged || logoChanged)) {
    return data;
  }

  return { ...data, previewVideoPlaybackId: null };
};

/**
 * Puts the composed video on the public page, when an administrator approves.
 *
 * Only on the move *into* `active`, and only from somewhere else:
 * `lib/sponsorshipStatus.ts` allows `pending_approval -> active` and nothing
 * else into it, so this fires once in a sponsorship's life. Every other write
 * — the payment webhook's, the callback's, a rename, a rejection — leaves the
 * public column exactly as it was.
 *
 * An existing `sponsoredVideoPlaybackId` is never overwritten, which matters
 * for a row imported with a composite already in place.
 *
 * A sponsorship with no composite is approved unchanged rather than refused. A
 * render can fail, and none is submitted at all where Remotion Lambda is not
 * configured (renders are asked for once a payment is paid,
 * `lib/paidRenders.ts`) — the gesture page then falls back to the original
 * video with the overlay drawn in HTML, which is a working page rather than an
 * approval an administrator cannot complete.
 */
export const publishComposedVideo: CollectionBeforeChangeHook<Sponsorship> = ({
  data,
  operation,
  originalDoc,
}) => {
  if (operation !== "update" || originalDoc === undefined) {
    return data;
  }

  const from = originalDoc.status;
  // `data` is the merged document, so an update that never mentions `status`
  // arrives carrying the current one and is not an approval.
  const to = data.status ?? from;

  if (from === to || to !== "active") {
    return data;
  }

  const composed = playbackId(data.previewVideoPlaybackId);

  if (composed === null || playbackId(data.sponsoredVideoPlaybackId) !== null) {
    return data;
  }

  return { ...data, sponsoredVideoPlaybackId: composed };
};
