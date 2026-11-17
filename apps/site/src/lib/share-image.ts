import { SHARE_CARD, type ShareImage } from "./head";

/**
 * A still of a gesture's Mux video, cropped by Mux to the signer
 * (`fit_mode=smartcrop`) and served as a JPEG, which every network and mail
 * client shows (WebP is not). Without `time` Mux takes the middle of the
 * video: the hands in motion, not the signer at rest on the first frame.
 */
function muxStill(playbackId: string, width: number, height: number): string {
  const params = new URLSearchParams({
    fit_mode: "smartcrop",
    height: String(height),
    width: String(width),
  });
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?${params.toString()}`;
}

/**
 * A gesture's share image: a landscape still at the card's own size, so a
 * 1.91:1 preview shows the signer instead of a centre crop of a portrait
 * frame. A per-gesture card with the name and the brand is a later step
 * (docs/DECISIONS.md, "Brand identity: metadata").
 */
export function gestureShareImage(playbackId: string, alt: string): ShareImage {
  return {
    alt,
    type: "image/jpeg",
    url: muxStill(playbackId, SHARE_CARD.width, SHARE_CARD.height),
    ...SHARE_CARD,
  };
}

/** `VideoObject.thumbnailUrl`: the 16:9, 4:3 and 1:1 stills search engines ask for. */
export function gestureThumbnails(playbackId: string): string[] {
  return [
    muxStill(playbackId, 1280, 720),
    muxStill(playbackId, 1200, 900),
    muxStill(playbackId, 1200, 1200),
  ];
}
