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
import { HAND, HandIllustration } from "./hand-illustration";

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
 * A data view failed to load: the registry `empty` parts with the open
 * palm in the brand green on a pale red disc (an error you did not cause:
 * the disc and the title say so, the colour is not the only signal; the
 * same mark on web and native), title, description and retry
 * (`states.error.*` by default).
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
            <span
              aria-hidden="true"
              className="grid size-24 place-items-center rounded-full bg-danger-subtle"
              data-slot="error-disc"
            >
              <HandIllustration
                className="h-12 text-primary"
                data-slot="error-illustration"
                hand={HAND.welcome}
              />
            </span>
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
