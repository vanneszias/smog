import { SITE_NAME } from "@/lib/brand";

/**
 * The logo on the admin's login screen, registered as
 * `admin.components.graphics.Logo` in `payload.config.ts`.
 *
 * Two files and a stylesheet switch rather than one: the admin keeps its own
 * theme on `<html data-theme>`, independent of the public site's `.dark`, and
 * the brand green that reads on its light background is too dark against its
 * dark one. `app/(payload)/custom.css` shows whichever image matches, and the
 * hidden one is `display: none`, so a screen reader meets one logo, not two.
 *
 * `<img>` from `public/brand/` rather than an inline SVG, because each file is
 * 18 KB of path data that would otherwise be rendered into the admin's HTML.
 */
export function Logo() {
  return (
    <span className="smog-admin-logo">
      {/* biome-ignore lint/performance/noImgElement: `next/image` routes through the image optimizer, which needs sharp and does not run on workerd. The file is a static SVG in `public/`, which needs no optimizing. */}
      <img
        alt={SITE_NAME}
        className="smog-admin-logo__light"
        height={52}
        src="/brand/logo-green.svg"
        width={240}
      />
      {/* biome-ignore lint/performance/noImgElement: as above. */}
      <img
        alt={SITE_NAME}
        className="smog-admin-logo__dark"
        height={52}
        src="/brand/logo-white.svg"
        width={240}
      />
    </span>
  );
}
