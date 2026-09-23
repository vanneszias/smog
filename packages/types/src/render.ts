/**
 * @fileoverview Render contract — Remotion Lambda's `SponsoredVideo` composition
 *
 * The one thing `apps/render` (which registers the composition) and
 * `apps/site` (which submits renders of it to Remotion Lambda) must agree on,
 * so a rename on either side is a typecheck failure rather than a render that
 * fails at Lambda's own validation.
 */

/** The one composition `apps/render` registers and `apps/site` renders. */
export const SPONSORED_VIDEO_COMPOSITION_ID = "SponsoredVideo";

/** Longest sponsor name the overlay fits; both apps enforce it. */
export const SPONSOR_NAME_MAX_LENGTH = 35;

/**
 * Input props of `SPONSORED_VIDEO_COMPOSITION_ID`, as the Worker sends them.
 *
 * `overlayConfig` is deliberately absent: the site never sends it, and the
 * composition falls back to its own `DEFAULT_OVERLAY_CONFIG`.
 */
export interface SponsoredVideoInputProps {
  logoUrl?: string;
  sponsorName: string;
  videoSrc: string;
}
