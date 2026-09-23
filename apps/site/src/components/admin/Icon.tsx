import { SITE_NAME } from "@/lib/brand";

/**
 * The mark in the admin's navigation, registered as
 * `admin.components.graphics.Icon` in `payload.config.ts`.
 *
 * The site's own icon — the stacked "SMOG & Co" mark in white on a green
 * tile — rather than the bare stacked mark: that mark exists only in white,
 * which vanishes on the admin's light theme, while the tile reads on both
 * themes with no switching. It is the same file as the favicon, so the browser
 * usually has it cached already.
 *
 * Payload sizes the slot (18 px square in the step nav) and this fills it.
 */
export function Icon() {
  return (
    // biome-ignore lint/performance/noImgElement: `next/image` routes through the image optimizer, which needs sharp and does not run on workerd. The file is a static SVG in `public/`, which needs no optimizing.
    <img
      alt={SITE_NAME}
      className="smog-admin-icon"
      height={18}
      src="/icon.svg"
      width={18}
    />
  );
}
