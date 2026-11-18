import { Trans, useTranslation } from "@smog/i18n/react";
import { Info, X } from "lucide-react";
import { type ComponentProps, type ReactNode, useId } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "../components/alert";
import { IconButton } from "../components/icon-button";
import { cn } from "../lib/cn";
import { focusRing } from "../lib/variants";

/**
 * The course messages `gesture.videoComplete.1..7` (the old app's
 * `VIDEO_COMPLETE_COUNT`, `@smog/config/constants`). The phrase that links to
 * the course ("Find a course", "Bekijk het cursusaanbod", …) is marked `<course>` in each
 * locale's copy, so every language links its own words; the contact address
 * is marked `<email>` and opens a mail to it.
 */
export const COURSE_MESSAGE_COUNT = 7;
export type CourseMessageIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CourseBannerProps
  extends Omit<ComponentProps<"div">, "children" | "title"> {
  /** The address marked `<email>` opens a mail to it (`CONTACT_EMAIL`); plain text without. */
  contactEmail?: string;
  /** Where the linked phrase goes (`COURSE_URL`). */
  courseUrl: string;
  /** Which message to show (the caller picks one per playthrough). */
  messageIndex: CourseMessageIndex;
  /** Adds a close button (`a11y.close`). */
  onDismiss?: () => void;
}

/**
 * The note after a gesture video ("Good to know"): the videos support a
 * SMOG course, they don't replace it. Calm, not a warning: the default card
 * alert with a green info icon. A polite status, so it is announced when it
 * appears.
 */
export function CourseBanner({
  className,
  contactEmail,
  courseUrl,
  messageIndex,
  onDismiss,
  ...props
}: CourseBannerProps): ReactNode {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <Alert
      aria-labelledby={titleId}
      className={cn("animate-fade-in motion-reduce:animate-none", className)}
      {...props}
    >
      <Info aria-hidden="true" className="text-primary-strong!" />
      <AlertTitle id={titleId}>{t("gesture.disclaimer.title")}</AlertTitle>
      <AlertDescription className="text-current">
        <Trans
          components={{
            course: (
              // biome-ignore lint/a11y/useAnchorContent: Trans puts the localized phrase inside
              <a
                className={cn(
                  "rounded-sm font-medium underline underline-offset-2 hover:no-underline",
                  focusRing
                )}
                href={courseUrl}
                rel="noopener noreferrer"
                target="_blank"
              />
            ),
            email: contactEmail ? (
              // biome-ignore lint/a11y/useAnchorContent: Trans puts the address inside
              <a
                className={cn(
                  "rounded-sm font-medium text-primary-strong underline underline-offset-2 hover:no-underline",
                  focusRing
                )}
                href={`mailto:${contactEmail}`}
              />
            ) : (
              <span />
            ),
          }}
          i18nKey={`gesture.videoComplete.${messageIndex}`}
        />
      </AlertDescription>
      {onDismiss ? (
        <AlertAction className="top-1.5 right-1.5">
          <IconButton
            icon={<X />}
            label={t("a11y.close")}
            onClick={onDismiss}
            size="md"
          />
        </AlertAction>
      ) : null}
    </Alert>
  );
}
