import { useTranslation } from "@smog/i18n/react";
import { RENDER_OVERLAY_LAYOUT } from "@smog/render/contract";
import { cn } from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import type { CSSProperties, ReactNode } from "react";
import { useObjectUrl } from "./use-object-url";

const { logo: LOGO, text: TEXT } = RENDER_OVERLAY_LAYOUT;

/** A fraction of the frame as a CSS percentage. */
function percent(fraction: number): string {
  return `${fraction * 100}%`;
}

/** The logo box: `size` of the width and the height, centred (ruling 7). */
const LOGO_STYLE: CSSProperties = {
  height: percent(LOGO.size),
  left: percent(LOGO.centerX),
  top: percent(LOGO.centerY),
  transform: "translate(-50%, -50%)",
  width: percent(LOGO.size),
};

/**
 * The two text lines, centred at `y`, `fontSize` of the frame's height
 * (`cqh`: the frame is a size container), in the video's fixed green.
 */
const TEXT_STYLE: CSSProperties = {
  color: TEXT.color,
  fontSize: `${TEXT.fontSize * 100}cqh`,
  top: percent(TEXT.y),
  transform: "translateY(-50%)",
};

export interface SponsorOverlayPreviewProps {
  className?: string;
  displayName: string;
  /** The local logo file (previewed through an object URL), or none. */
  logo: Blob | null;
  name: string;
  playbackId: string;
}

/**
 * A still of how the sponsored video ends (ruling 7): the gesture's
 * poster with the overlay drawn in CSS from the render contract's layout
 * constants (the logo box at 76 %, the text at 87 % in the brand green).
 * Phase 7 replaces this one component with the Remotion Player
 * `SponsorPreview`.
 */
export function SponsorOverlayPreview({
  className,
  displayName,
  logo,
  name,
  playbackId,
}: SponsorOverlayPreviewProps): ReactNode {
  const { t } = useTranslation();
  const logoUrl = useObjectUrl(logo);
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div
        aria-label={t("sponsor.review.previewLabel", { name })}
        className="relative aspect-3/4 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken [container-type:size]"
        role="img"
      >
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          height={640}
          loading="lazy"
          src={muxThumbnailUrl(playbackId, { width: 480 })}
          width={480}
        />
        {logoUrl ? (
          <img
            alt=""
            className="absolute object-contain"
            height={96}
            src={logoUrl}
            style={LOGO_STYLE}
            width={96}
          />
        ) : null}
        <p
          className="absolute inset-x-2 text-center font-semibold leading-tight"
          style={TEXT_STYLE}
        >
          <span className="block">{TEXT.intro}</span>
          <span className="block break-words">{displayName}</span>
        </p>
      </div>
      <figcaption className="truncate text-body-sm text-foreground-muted">
        {name}
      </figcaption>
    </figure>
  );
}
