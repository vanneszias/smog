import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface SponsorEndCardProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** The logo, a same-origin path or an object URL; none when the sponsor has no logo. */
  logoSrc?: string | null | undefined;
  /** The sponsor's name, as typed (never translated or reformatted). */
  name: string;
  /**
   * Whether it is on screen (the player's last seconds). It stays mounted
   * while hidden, so it can leave with a fade instead of vanishing when the
   * video loops or is seeked back. Shown by default (the sponsor preview).
   */
  shown?: boolean;
}

/**
 * The sponsor message over the last seconds of a gesture video (phase 10b
 * ruling 9), drawn as part of the film: a deep green band rising from the
 * bottom of the frame (the `sidebar` green, solid behind the text, so the
 * pairs `sidebar-foreground` and `sidebar-foreground-muted` on `sidebar`
 * hold on any frame), "Made possible by" in the viewer's language, the
 * sponsor's name as typed and the logo on a light plate. The caller places
 * it at the bottom of the frame.
 *
 * It is decoration (`aria-hidden`): the gesture page states the credit in
 * text (the sponsor card), so a screen reader never gets it twice. Taps go
 * through it to the player's controls. It rises 8 px and fades in over
 * `duration-slow` with `ease-enter`, and leaves faster (`duration-normal`,
 * fade only); under reduced motion it appears and goes at once.
 */
export function SponsorEndCard({
  className,
  logoSrc,
  name,
  shown = true,
  ...props
}: SponsorEndCardProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "@container pointer-events-none bg-linear-to-t from-70% from-sidebar to-transparent",
        "transition-[opacity,translate,visibility] duration-slow ease-enter motion-reduce:transition-none",
        "data-[state=hidden]:invisible data-[state=hidden]:translate-y-2 data-[state=hidden]:opacity-0 data-[state=hidden]:duration-normal data-[state=hidden]:ease-standard",
        className
      )}
      data-slot="sponsor-end-card"
      data-state={shown ? "shown" : "hidden"}
      {...props}
    >
      <div className="flex items-center gap-3 px-[6cqw] pt-[18cqw] pb-4">
        {logoSrc ? (
          <span className="inline-flex shrink-0 rounded-md bg-sidebar-foreground p-1.5">
            <img
              alt=""
              className="size-10 object-contain"
              data-slot="sponsor-end-card-logo"
              decoding="async"
              height={40}
              src={logoSrc}
              width={40}
            />
          </span>
        ) : null}
        <p className="flex min-w-0 flex-col text-left">
          <span className="text-body-sm text-sidebar-foreground-muted">
            {t("endCard.message")}
          </span>
          <span className="wrap-anywhere font-semibold text-sidebar-foreground text-title-3">
            {name}
          </span>
        </p>
      </div>
    </div>
  );
}
