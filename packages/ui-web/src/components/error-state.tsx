import { useTranslation } from "@smog/i18n/react";
import { CircleAlert, RotateCw } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";

export interface ErrorStateProps
  extends Omit<ComponentProps<"section">, "title"> {
  description?: ReactNode;
  level?: 2 | 3 | 4;
  /** Shows a retry button (`states.retry`). */
  onRetry?: () => void;
  /** Busy state of the retry button while it reloads. */
  retrying?: boolean;
  title?: ReactNode;
}

/** A data view failed to load: title, description and retry (`states.error.*` by default). */
export function ErrorState({
  className,
  description,
  level = 3,
  onRetry,
  retrying = false,
  title,
  ...props
}: ErrorStateProps): ReactNode {
  const { t } = useTranslation();
  const Heading = `h${level}` as const;
  return (
    <section
      className={cn(
        "mx-auto flex max-w-reading flex-col items-center gap-3 px-4 py-10 text-center",
        className
      )}
      role="alert"
      {...props}
    >
      <span
        aria-hidden="true"
        className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger-strong"
      >
        <CircleAlert className="size-6" />
      </span>
      <Heading className="font-semibold text-foreground text-title-3">
        {title ?? t("states.error.title")}
      </Heading>
      <p className="text-body text-foreground-muted">
        {description ?? t("states.error.description")}
      </p>
      {onRetry ? (
        <Button
          className="mt-2"
          icon={<RotateCw />}
          loading={retrying}
          onClick={onRetry}
          variant="secondary"
        >
          {t("states.retry")}
        </Button>
      ) : null}
    </section>
  );
}
