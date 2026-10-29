import { cn, Heading, Logo, Text } from "@smog/ui-web";
import type { ReactNode } from "react";

/** The colour of a state's icon: neutral, done or failed. */
export type AuthPageTone = "danger" | "primary" | "success";

const ICON_TONES: Record<AuthPageTone, string> = {
  danger: "bg-danger-subtle text-danger-strong",
  primary: "bg-primary-subtle text-primary-strong",
  success: "bg-success-subtle text-success-strong",
};

/**
 * The content of every auth page, inside the auth shell's `main`: the
 * page heading, an optional line and the step. A state that is not a
 * form (a sent link, a success, a bad link) brings an icon in its tone.
 * Below `md` the shell's green panel is hidden, so the logo leads here.
 */
export function AuthPage({
  children,
  description,
  icon,
  tone = "primary",
  title,
}: {
  children: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: AuthPageTone;
  title: ReactNode;
}): ReactNode {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <Logo className="md:hidden" decorative size="md" tone="primary" />
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-12 items-center justify-center rounded-full *:size-6",
            ICON_TONES[tone]
          )}
          data-tone={tone}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        <Heading level={1} size="title-1">
          {title}
        </Heading>
        {description ? <Text tone="muted">{description}</Text> : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}
