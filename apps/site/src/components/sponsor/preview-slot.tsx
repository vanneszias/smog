import { useTranslation } from "@smog/i18n/react";
import { cn, GestureThumbnail, SponsorEndCard } from "@smog/ui-web";
import type { ReactNode } from "react";
import { useObjectUrl } from "./use-object-url";

export interface SponsorPreviewProps {
  className?: string;
  /** The name as typed (trimmed); the card shows none while it is empty. */
  displayName: string;
  /** The local logo file (previewed through an object URL), or none. */
  logo: Blob | null;
  /** The gesture's name: it names the preview. */
  name: string;
  playbackId: string;
}

/**
 * How the sponsorship looks in the app (phase 10b ruling 9, S-10): the
 * gesture's own picture with the end card the player draws over the last
 * seconds of its video: "Made possible by" in the viewer's language, the
 * name as typed and the logo. Nothing is rendered or loaded but the poster
 * and the local logo, so there is no player, no chunk and no failure to
 * handle: it updates as the sponsor types. The frame is a fixed 3:4 box, so
 * nothing shifts when the poster arrives.
 */
export function SponsorPreviewSlot({
  className,
  displayName,
  logo,
  name,
  playbackId,
}: SponsorPreviewProps): ReactNode {
  const { t } = useTranslation();
  const logoUrl = useObjectUrl(logo);
  const shownName = displayName.trim();
  return (
    <figure className={cn("flex w-full max-w-80 flex-col gap-3", className)}>
      <div
        aria-label={t("sponsor.preview.label", { name })}
        className="relative aspect-3/4 w-full overflow-hidden rounded-card bg-sidebar shadow-1 ring-1 ring-foreground/10"
        role="img"
      >
        {/* The frame's label names the picture; the poster and the card
            (`aria-hidden` itself) are not read out. */}
        <div aria-hidden="true" className="absolute inset-0">
          <GestureThumbnail
            className="absolute inset-0 size-full"
            name={name}
            playbackId={playbackId}
            width={480}
          />
          {shownName ? (
            <SponsorEndCard
              className="absolute inset-x-0 bottom-0"
              logoSrc={logoUrl}
              name={shownName}
            />
          ) : null}
        </div>
      </div>
      <p className="text-body-sm text-muted-foreground">
        {t("sponsor.preview.caption")}
      </p>
    </figure>
  );
}
