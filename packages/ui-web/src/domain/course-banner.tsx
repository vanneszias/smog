import { Trans, useTranslation } from "@smog/i18n/react";
import { Info, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import { IconButton } from "../components/icon-button";
import { cn } from "../lib/cn";
import { focusRing } from "../lib/variants";

/**
 * The course messages `gesture.videoComplete.1..7` (the old app's
 * `VIDEO_COMPLETE_COUNT`, `@smog/config/constants`). The phrase that links to
 * the course ("Click here", "klik dan hier", …) is marked `<course>` in each
 * locale's copy, so every language links its own words.
 */
export const COURSE_MESSAGE_COUNT = 7;
export type CourseMessageIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CourseBannerProps
  extends Omit<ComponentProps<"section">, "children" | "title"> {
  /** Where the linked phrase goes (`COURSE_URL`). */
  courseUrl: string;
  /** Which message to show (the caller picks one per playthrough). */
  messageIndex: CourseMessageIndex;
  /** Adds a close button (`a11y.close`). */
  onDismiss?: () => void;
}

/**
 * The disclaimer after a gesture video: the videos support a SMOG course,
 * they don't replace it. A polite status, so it is announced when it appears.
 */
export function CourseBanner({
  className,
  courseUrl,
  messageIndex,
  onDismiss,
  ...props
}: CourseBannerProps): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex animate-fade-in items-start gap-3 rounded-lg border border-border-subtle border-l-4 border-l-warning bg-surface p-4 text-foreground motion-reduce:animate-none",
        className
      )}
      role="status"
      {...props}
    >
      <Info
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-warning-strong"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="font-semibold text-body-sm" id={titleId}>
          {t("gesture.disclaimer.title")}
        </p>
        <p className="text-body-sm">
          <Trans
            components={{
              course: (
                // biome-ignore lint/a11y/useAnchorContent: Trans puts the localized phrase inside
                <a
                  className={cn(
                    "rounded-sm font-medium text-primary-strong underline underline-offset-2 hover:no-underline",
                    focusRing
                  )}
                  href={courseUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              ),
            }}
            i18nKey={`gesture.videoComplete.${messageIndex}`}
          />
        </p>
      </div>
      {onDismiss ? (
        <IconButton
          className="-mt-2 -mr-2"
          icon={<X />}
          label={t("a11y.close")}
          onClick={onDismiss}
          size="md"
        />
      ) : null}
    </section>
  );
}
