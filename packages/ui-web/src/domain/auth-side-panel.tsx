import type { ComponentProps, ReactNode } from "react";
import { HandIllustration } from "../components/hand-illustration";
import { Logo } from "../components/logo";
import { cn } from "../lib/cn";

export interface AuthSidePanelProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** A quieter line under the tagline (`home.intro`). */
  description?: ReactNode;
  /** The line under the logo (`home.tagline`). */
  tagline: ReactNode;
}

/**
 * The brand side of an auth page: the green surface with the logo, the
 * tagline, an optional line about SMOG and two brand hands. It fills the
 * height it is given (the auth shell makes it the viewport). Decorative, so
 * it is hidden below `md` (the form is the page) and carries no landmark.
 */
export function AuthSidePanel({
  className,
  description,
  tagline,
  ...props
}: AuthSidePanelProps): ReactNode {
  return (
    <div
      className={cn(
        "relative isolate hidden flex-col gap-10 overflow-hidden bg-primary p-8 text-primary-foreground md:flex lg:p-12",
        className
      )}
      data-slot="auth-side-panel"
      {...props}
    >
      {/* A large hand bleeding off the corner: texture, not content. */}
      <HandIllustration
        className="-right-16 -bottom-12 absolute -z-10 h-80 text-primary-foreground/10 lg:h-112"
        hand={1}
      />
      <Logo decorative size="md" tone="current" />
      <div className="flex max-w-md flex-1 flex-col justify-center gap-4">
        <HandIllustration
          className="h-14 self-start text-primary-foreground/40"
          hand={0}
        />
        <p className="font-semibold text-title-1 lg:text-4xl lg:leading-tight">
          {tagline}
        </p>
        {description ? (
          <p className="text-body text-primary-foreground-muted lg:text-title-3">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
