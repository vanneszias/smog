/**
 * **A seam, deliberately.**
 *
 * Which video the review step plays, given the sponsorship in front of it.
 *
 * ## What this returns, and what changed
 *
 * The composed preview when there is one, and the gesture's own video until
 * there is. It once returned the original *always*, and said so as a test
 * rather than as a comment: `renderPreview.test.ts` asserted that a subject
 * carrying a composed preview still played the original, with the note that
 * the test was meant to fail once composition existed. It did, and the body
 * is all that changed — **the signature did not**, so the two callers
 * (`sponsor/preview/page.tsx` and `sponsor/re-edit/page.tsx`) keep calling it
 * exactly as before.
 *
 * That is what the seam bought. Without it, the render callback could have
 * written `previewVideoPlaybackId`, nothing would have preferred it here,
 * and no test in the repository would have noticed that the sponsor was still
 * approving a video with no logo on it.
 *
 * ## Why the fallback stays, and is not a transitional leftover
 *
 * A render takes minutes and this page is reachable the whole time. A sponsor
 * who reloads mid-render must see the video they are sponsoring with the
 * overlay drawn in HTML on top — which is exactly what the preview did before
 * composition existed — and not an error or an empty player. The fallback is
 * also what covers a render that failed outright: `endpoints/render.ts` records
 * the failure and attaches nothing, so the column stays NULL and this keeps
 * answering.
 *
 * The empty string is treated as absent along with `null`. A `??` alone would
 * hand the player `""`, which is a broken video rather than the original one,
 * and nothing in this database stops a text column holding `""` — see
 * `endpoints/sponsorships.ts`, which maps its own optional fields to `null` by
 * hand for the same reason.
 */

/**
 * Not exported, for the reason `lib/gestureQuery.ts` gives at length: knip
 * fails `bun release:check` on an exported symbol nothing imports, and the
 * only caller builds an object literal. It is still this module's contract;
 * it is just spelled out in the signature instead of re-exported.
 *
 * A structural shape rather than `Sponsorship`, because the review step
 * runs before any row exists — the rows are created at checkout, which is
 * after the sponsor has approved what they are buying. The preview page builds this
 * from the gesture it resolved, and the same call works unchanged against a
 * real document later.
 */
interface PreviewSubject {
  /** The gesture's own Mux playback id. Always present. */
  originalVideoPlaybackId: string;
  /**
   * The composed preview's playback id, when one exists.
   *
   * Written by `POST /api/render/callback` when Remotion Lambda's composite
   * reaches Mux, and only onto a sponsorship still waiting for one — a
   * cancelled, rejected or re-editing sponsorship is left alone, so what this
   * property holds is always a composite of the overlay currently on the row.
   */
  previewVideoPlaybackId?: null | string;
}

/** The playback id the review step should play. */
export function previewPlaybackId(subject: PreviewSubject): string {
  const composed = subject.previewVideoPlaybackId;

  return typeof composed === "string" && composed !== ""
    ? composed
    : subject.originalVideoPlaybackId;
}
