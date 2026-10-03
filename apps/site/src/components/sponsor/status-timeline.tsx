import { useTranslation } from "@smog/i18n/react";
import { cn } from "@smog/ui-web";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

/**
 * "What happens next?" after a paid sponsorship (S-14): the payment is
 * confirmed (done), the video is made, an administrator reviews it within
 * five working days, and an email follows when it is live.
 */
export function StatusTimeline(): ReactNode {
  const { t } = useTranslation();
  const steps = [
    { done: true, label: t("sponsor.success.timeline.paid") },
    { done: false, label: t("sponsor.success.timeline.video") },
    { done: false, label: t("sponsor.success.timeline.review") },
    { done: false, label: t("sponsor.success.timeline.live") },
  ];
  return (
    <section
      aria-labelledby="sponsor-timeline"
      className="flex flex-col gap-4 rounded-lg bg-primary-subtle p-4 sm:p-6"
    >
      <h2
        className="font-semibold text-primary-strong text-title-3"
        id="sponsor-timeline"
      >
        {t("sponsor.success.timeline.title")}
      </h2>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li className="flex gap-3" key={step.label}>
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-semibold text-caption",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-primary-strong bg-surface text-primary-strong"
                )}
              >
                {step.done ? (
                  <Check
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={3}
                  />
                ) : (
                  index + 1
                )}
              </span>
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="w-0.5 flex-1 bg-primary-strong/40"
                />
              ) : null}
            </span>
            <span className="pb-4 text-body text-foreground">{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
