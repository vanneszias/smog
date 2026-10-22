import type { ComponentProps, ReactNode } from "react";
import { HandIllustration } from "../components/hand-illustration";
import { Logo } from "../components/logo";
import { cn } from "../lib/cn";

export interface AuthSidePanelProps
  extends Omit<ComponentProps<"div">, "children"> {
  /** The line under the logo (`home.tagline`). */
  tagline: ReactNode;
}

/**
 * The brand side of an auth page: the green surface with the logo, a line
 * about SMOG and a brand hand. Decorative, so it is hidden below `md`
 * (the form is the page) and carries no landmark.
 */
export function AuthSidePanel({
  className,
  tagline,
  ...props
}: AuthSidePanelProps): ReactNode {
  return (
    <div
      className={cn(
        "relative hidden flex-col justify-between gap-8 overflow-hidden bg-primary p-8 text-primary-foreground md:flex",
        className
      )}
      data-slot="auth-side-panel"
      {...props}
    >
      <Logo decorative size="md" tone="current" />
      <p className="relative max-w-60 font-semibold text-title-2">{tagline}</p>
      <HandIllustration
        className="h-40 self-end text-primary-foreground/30"
        hand={0}
      />
    </div>
  );
}
