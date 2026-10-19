import { handSvgs } from "@smog/brand/svg";
import { useTranslation } from "@smog/i18n/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

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

/** No data yet: title, description and the next action (`states.empty.*` by default). */
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
  const Heading = `h${level}` as const;
  const hand =
    illustration === undefined || illustration === false
      ? null
      : handSvgs[illustration === true ? 0 : illustration];
  return (
    <section
      className={cn(
        "mx-auto flex max-w-reading flex-col items-center gap-3 px-4 py-10 text-center",
        className
      )}
      {...props}
    >
      {hand ? (
        <span
          aria-hidden="true"
          className="mb-2 inline-flex h-16 text-primary *:h-full *:w-auto"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: generated, trusted artwork from @smog/brand
          dangerouslySetInnerHTML={{ __html: hand }}
          data-slot="empty-illustration"
        />
      ) : null}
      {icon && !hand ? (
        <span
          aria-hidden="true"
          className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary-strong *:size-6"
        >
          {icon}
        </span>
      ) : null}
      <Heading
        className={cn(
          "font-semibold text-foreground",
          level === 1 ? "text-title-1" : "text-title-3"
        )}
      >
        {title ?? t("states.empty.title")}
      </Heading>
      <p className="text-body text-foreground-muted">
        {description ?? t("states.empty.description")}
      </p>
      {action ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </section>
  );
}
