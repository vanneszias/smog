import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SponsorEndCardProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** The logo, a same-origin path or an object URL; none when the sponsor has no logo. */
  logoSrc?: string | null | undefined;
  /** The sponsor's name, as typed (never translated or reformatted). */
  name: string;
}

/**
 * The sponsor message over the last seconds of a gesture video (phase 10b
 * ruling 9): "Made possible by" in the viewer's language (the catalogue),
 * the sponsor's name as typed and the logo. It is decoration (`aria-hidden`):
 * the gesture page states the credit in text (the sponsor card), so a
 * screen reader never gets it twice. It fades in, and does not move or fade
 * when the system asks for reduced motion. Taps go through it to the
 * player's controls. A solid `card` surface, so the text reads on any frame.
 */
export function SponsorEndCard({
  className,
  logoSrc,
  name,
  ...props
}: SponsorEndCardProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none flex justify-center", className)}
      data-slot="sponsor-end-card"
      {...props}
    >
      <div className="flex max-w-full animate-fade-in items-center gap-3 rounded-xl bg-card px-4 py-3 text-card-foreground shadow-2 motion-reduce:animate-none">
        {logoSrc ? (
          <img
            alt=""
            className="size-12 shrink-0 rounded-md object-contain"
            data-slot="sponsor-end-card-logo"
            decoding="async"
            height={48}
            src={logoSrc}
            width={48}
          />
        ) : null}
        <p className="flex min-w-0 flex-col text-left">
          <span className="text-body-sm text-muted-foreground">
            {t("endCard.message")}
          </span>
          <span className="wrap-anywhere font-semibold text-body">{name}</span>
        </p>
      </div>
    </div>
  );
}
