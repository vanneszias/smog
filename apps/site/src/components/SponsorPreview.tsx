import { Card, VideoPlayer } from "@smog/ui-web";

/**
 * One gesture as the review step shows it: the video, and the overlay text
 * beside it.
 *
 * **Beside, not burned in.** Stage 5 has no compositing — that is Remotion
 * and Mux, which the spec puts in Stage 6 — so `lib/renderPreview.ts` hands
 * this the gesture's own playback id and the sponsor's text is a caption. The
 * public gesture page renders a live sponsorship the same way, in a `Card`
 * under the player, so a sponsor reviewing an order sees the same two pieces
 * they will get.
 *
 * No `"use client"`: `VideoPlayer` carries its own, and every prop crossing
 * this boundary is a string.
 *
 * `data-playback-id` for the same reason the detail page gives —
 * `@mux/mux-player-react` server-renders no `playback-id` and sets it after
 * hydration, so "the player was given the right id" is not observable on the
 * element itself.
 */
export function SponsorPreview({
  overlayText,
  playbackId,
  title,
}: {
  overlayText: string;
  playbackId: string;
  title: string;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="font-semibold text-foreground text-md">{title}</h2>
      <div data-playback-id={playbackId} data-testid="sponsor-preview-video">
        <VideoPlayer playbackId={playbackId} title={title} />
      </div>
      <p
        className="font-medium text-foreground text-sm"
        data-testid="sponsor-preview-overlay"
      >
        {overlayText}
      </p>
    </Card>
  );
}
