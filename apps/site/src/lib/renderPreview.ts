/**
 * **The Stage 6 seam.**
 *
 * Which video the review step plays, given the sponsorship in front of it.
 *
 * ## What this returns today, and why it is not the final answer
 *
 * The shipped product's step 3 reviews a *pre-composed* preview: the
 * sponsor's logo and text already burned into the frame by Remotion and
 * served from Mux. Composition is Stage 6, and the spec orders the stages
 * strictly — so Stage 5 cannot show a composited preview without reaching
 * into the next one.
 *
 * Rather than resequence, this stage plays the gesture's **original** video
 * and draws the overlay as HTML on top of it. The sponsor sees the video they
 * are sponsoring and the words that will appear on it; they do not see the
 * final composite until Stage 6. The product owner confirmed that ordering on
 * 2026-09-21.
 *
 * ## What Stage 6 changes, and what it must not
 *
 * **Stage 6 replaces the body. It does not change the signature.** When a
 * composed preview exists it is `previewVideoPlaybackId`, which is already a
 * column on `sponsorships` and is already a parameter here — Stage 6's change
 * is to prefer it, and everything that calls this keeps calling it the same
 * way.
 *
 * `renderPreview.test.ts` asserts the Stage 5 contract explicitly: a subject
 * that *has* a composed preview still plays the original. That test is
 * supposed to fail in Stage 6, which is the point — it makes the seam
 * something a future task has to open on purpose rather than something it
 * discovers it has already walked through.
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
   * Nothing writes it in Stage 5 — `POST /api/render/callback` is Stage 6 —
   * so it is always absent here today. It is in the signature now precisely
   * so that Stage 6 does not have to change one.
   */
  previewVideoPlaybackId?: null | string;
}

/** The playback id the review step should play. */
export function previewPlaybackId(subject: PreviewSubject): string {
  return subject.originalVideoPlaybackId;
}
