import { useTranslation } from "@smog/i18n/react";
import { RotateCw } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";
import { HandIllustration } from "./hand-illustration";

export interface ErrorStateProps
  extends Omit<ComponentProps<"section">, "title"> {
  description?: ReactNode;
  level?: 1 | 2 | 3 | 4;
  /** Shows a retry button (`states.retry`). */
  onRetry?: () => void;
  /** Busy state of the retry button while it reloads. */
  retrying?: boolean;
  title?: ReactNode;
}

/**
 * A data view failed to load: the registry `empty` parts with a brand hand,
 * title, description and retry (`states.error.*` by default).
 */
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
  return (
    <section
      className={cn("mx-auto flex w-full max-w-reading", className)}
      data-slot="error-state"
      role="alert"
      {...props}
    >
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyMedia>
            <HandIllustration
              className="h-20 text-danger-strong"
              data-slot="error-illustration"
              hand={2}
            />
          </EmptyMedia>
          <EmptyTitle level={level}>
            {title ?? t("states.error.title")}
          </EmptyTitle>
          <EmptyDescription>
            {description ?? t("states.error.description")}
          </EmptyDescription>
        </EmptyHeader>
        {onRetry ? (
          <EmptyContent>
            <Button
              icon={<RotateCw />}
              loading={retrying}
              onClick={onRetry}
              variant="secondary"
            >
              {t("states.retry")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </section>
  );
}
