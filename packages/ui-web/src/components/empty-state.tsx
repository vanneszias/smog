import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";
import { HandIllustration } from "./hand-illustration";

export interface EmptyStateProps
  extends Omit<ComponentProps<"section">, "title"> {
  /** The next action (spec §16: every empty state offers one). */
  action?: ReactNode;
  description?: ReactNode;
  /** A decorative icon above the title. */
  icon?: ReactNode;
  /** Show one of the brand hands (index into `handSvgs`, `true` = the first). */
  illustration?: boolean | 0 | 1 | 2;
  /** Heading level of the title (3 by default); 1 for a page-level state (the page's h1). */
  level?: 1 | 2 | 3 | 4;
  title?: ReactNode;
}

/**
 * No data yet: the registry `empty` parts with the brand hand (or an icon),
 * title, description and the next action (`states.empty.*` by default).
 */
export function EmptyState({
  action,
  className,
  description,
  icon,
  illustration,
  level = 3,
  title,
  ...props
}: EmptyStateProps): ReactNode {
  const { t } = useTranslation();
  let hand: 0 | 1 | 2 | null = null;
  if (illustration === true) {
    hand = 0;
  } else if (illustration !== undefined && illustration !== false) {
    hand = illustration;
  }
  return (
    <section
      className={cn("mx-auto flex w-full max-w-reading", className)}
      data-slot="empty-state"
      {...props}
    >
      <Empty className="py-10">
        <EmptyHeader>
          {hand === null ? null : (
            <EmptyMedia>
              <HandIllustration
                className="h-20"
                data-slot="empty-illustration"
                hand={hand}
              />
            </EmptyMedia>
          )}
          {icon && hand === null ? (
            <EmptyMedia variant="icon">
              <span aria-hidden="true" className="inline-flex">
                {icon}
              </span>
            </EmptyMedia>
          ) : null}
          <EmptyTitle level={level}>
            {title ?? t("states.empty.title")}
          </EmptyTitle>
          <EmptyDescription>
            {description ?? t("states.empty.description")}
          </EmptyDescription>
        </EmptyHeader>
        {action ? <EmptyContent>{action}</EmptyContent> : null}
      </Empty>
    </section>
  );
}
