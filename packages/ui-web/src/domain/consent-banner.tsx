import { useTranslation } from "@smog/i18n/react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { Button } from "../components/button";
import { Card } from "../components/card";
import { HAND, HandIllustration } from "../components/hand-illustration";
import { TextLink } from "../components/text-link";
import { cn } from "../lib/cn";

export interface ConsentBannerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** Disables both choices while a decision is being saved. */
  busy?: boolean;
  /** In the flow of the page (the gallery) instead of fixed to the viewport. */
  inline?: boolean;
  onAllow: () => void;
  onDecline: () => void;
  /** The privacy policy (`/privacy`). */
  privacyHref: string;
}

/**
 * The analytics consent prompt (spec §12, inventory P-05): a labelled
 * region fixed to the bottom of the viewport, a registry `card` with the
 * purpose, a link to the privacy policy and two equally sized choices. It does not block the
 * page: nothing is sent while no choice was made.
 *
 * On a phone it is compact (identity overhaul, D): no art, the text in the
 * small step and the two choices side by side, about a third of the height
 * it had, clear of the home indicator (`safe-area-inset-bottom`). From `md`
 * the open palm (welcome) leads it. The page's own bottom bar steps back
 * while it is open (the site's `useOverlayBarOpen`), so only one bar sits
 * at the bottom at a time.
 */
export function ConsentBanner({
  busy = false,
  className,
  inline = false,
  onAllow,
  onDecline,
  privacyHref,
  ...props
}: ConsentBannerProps): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        inline
          ? "text-foreground"
          : "pointer-events-none fixed inset-x-0 bottom-0 z-40 animate-slide-up p-2 pb-[max(--spacing(2),env(safe-area-inset-bottom))] text-foreground motion-reduce:animate-none md:p-4",
        className
      )}
      data-slot="consent-banner"
      {...props}
    >
      <Card
        className="pointer-events-auto mx-auto w-full max-w-content flex-col gap-3 rounded-card p-3 md:flex-row md:items-center md:gap-6 md:p-5"
        variant="raised"
      >
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <HandIllustration
            className="mt-1 hidden h-8 md:inline-flex"
            hand={HAND.welcome}
          />
          <div className="flex min-w-0 max-w-reading flex-col gap-0.5 md:gap-1">
            <p className="font-semibold text-body" id={titleId}>
              {t("consent.title")}
            </p>
            <p className="text-body-sm text-muted-foreground">
              {t("consent.description")}{" "}
              <TextLink href={privacyHref}>{t("consent.privacyLink")}</TextLink>
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2">
          <Button
            className="h-auto whitespace-normal text-center"
            disabled={busy}
            onClick={onDecline}
            variant="secondary"
          >
            {t("consent.decline")}
          </Button>
          <Button
            className="h-auto whitespace-normal text-center"
            disabled={busy}
            onClick={onAllow}
          >
            {t("consent.allow")}
          </Button>
        </div>
      </Card>
    </section>
  );
}
