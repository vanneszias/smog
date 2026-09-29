import { useTranslation } from "@smog/i18n/react";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn";

export interface StepperStep {
  label: string;
}

export interface StepperProps extends Omit<ComponentProps<"nav">, "children"> {
  /** Zero-based index of the current step. */
  current: number;
  steps: readonly StepperStep[];
}

/**
 * The step bar of a wizard: done, current and upcoming steps. Below `sm`
 * only the markers show, with "Step n of m" and the current label above.
 */
export function Stepper({
  className,
  current,
  steps,
  ...props
}: StepperProps): ReactNode {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("a11y.steps")}
      className={cn("flex flex-col gap-2", className)}
      {...props}
    >
      <p className="flex flex-col sm:sr-only">
        <span className="text-caption text-foreground-muted">
          {t("kit.stepOf", { current: current + 1, total: steps.length })}
        </span>
        <span
          aria-hidden="true"
          className="font-semibold text-body text-foreground"
        >
          {steps[current]?.label}
        </span>
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const last = index === steps.length - 1;
          return (
            <li
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2",
                last ? "shrink-0" : "min-w-0 flex-1"
              )}
              key={step.label}
            >
              <span
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-body-sm",
                  done || active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-foreground-muted bg-surface text-foreground-muted"
                )}
                data-slot="step-marker"
              >
                {done ? (
                  <Check
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={3}
                  />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "shrink-0 whitespace-nowrap text-body-sm max-sm:sr-only",
                  active
                    ? "font-semibold text-foreground"
                    : "text-foreground-muted"
                )}
              >
                {step.label}
                {done ? (
                  <span className="sr-only">{` (${t("a11y.stepCompleted")})`}</span>
                ) : null}
              </span>
              {last ? null : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 min-w-4 flex-1 rounded-full",
                    done ? "bg-primary" : "bg-border"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
