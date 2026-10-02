import { useTranslation } from "@smog/i18n/react";
import { ShieldCheck } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { Button } from "../components/button";
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
 * region fixed to the bottom of the viewport with the purpose, a link to
 * the privacy policy and two equally sized choices. It does not block the
 * page: nothing is sent while no choice was made.
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
        "z-40 border-border-subtle border-t bg-surface-raised text-foreground shadow-2",
        inline
          ? "rounded-lg border"
          : "fixed inset-x-0 bottom-0 animate-slide-up motion-reduce:animate-none",
        className
      )}
      {...props}
    >
      <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:gap-6 md:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <ShieldCheck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-primary-strong"
          />
          <div className="flex min-w-0 max-w-reading flex-col gap-1">
            <p className="font-semibold text-body" id={titleId}>
              {t("consent.title")}
            </p>
            <p className="text-body-sm text-foreground-muted">
              {t("consent.description")}{" "}
              <TextLink href={privacyHref}>{t("consent.privacyLink")}</TextLink>
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Button disabled={busy} onClick={onDecline} variant="secondary">
            {t("consent.decline")}
          </Button>
          <Button disabled={busy} onClick={onAllow}>
            {t("consent.allow")}
          </Button>
        </div>
      </div>
    </section>
  );
}
