import { Trans, useTranslation } from "@smog/i18n/react";
import Info from "lucide-react-native/icons/info";
import X from "lucide-react-native/icons/x";
import { type ReactElement, useCallback } from "react";
import { Linking, Text, View, type ViewProps } from "react-native";
import { IconButton } from "../components/icon-button";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";

/**
 * The course messages `gesture.videoComplete.1..7` (the old app's
 * `VIDEO_COMPLETE_COUNT`); the linked phrase is marked `<course>` in each
 * locale's copy. Same as `@smog/ui-web`.
 */
export const COURSE_MESSAGE_COUNT = 7;
export type CourseMessageIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CourseBannerProps extends Omit<ViewProps, "children"> {
  className?: string;
  /** Where the linked phrase goes (`COURSE_URL`). */
  courseUrl: string;
  /** Which message to show (the caller picks one per playthrough). */
  messageIndex: CourseMessageIndex;
  /** Adds a close button (`a11y.close`). */
  onDismiss?: () => void;
}

function report(error: unknown): void {
  console.error("[uiNative] Failed to open the course link:", error);
}

/** The disclaimer after a gesture video; a polite live region. */
export function CourseBanner({
  className,
  courseUrl,
  messageIndex,
  onDismiss,
  ...props
}: CourseBannerProps): ReactElement {
  const { t } = useTranslation();
  const warning = useColor("warningStrong");
  const openCourse = useCallback((): void => {
    Linking.openURL(courseUrl).catch(report);
  }, [courseUrl]);
  return (
    <View
      accessibilityLiveRegion="polite"
      className={cn(
        "flex-row items-start gap-3 rounded-lg border border-border-subtle border-l-4 border-l-warning bg-surface p-4",
        className
      )}
      {...props}
    >
      <View
        accessibilityElementsHidden
        className="mt-0.5"
        importantForAccessibility="no-hide-descendants"
      >
        <Info color={warning} size={ICON_SIZE.md} />
      </View>
      <View className="flex-1 flex-col gap-1">
        <Text className="font-semibold text-body-sm text-foreground">
          {t("gesture.disclaimer.title")}
        </Text>
        <Text className="text-body-sm text-foreground">
          <Trans
            components={{
              course: (
                <Text
                  accessibilityRole="link"
                  className="font-medium text-primary-strong underline"
                  onPress={openCourse}
                />
              ),
            }}
            i18nKey={`gesture.videoComplete.${messageIndex}`}
          />
        </Text>
      </View>
      {onDismiss ? (
        <IconButton
          className="-mt-2 -mr-2"
          icon={<X />}
          label={t("a11y.close")}
          onPress={onDismiss}
        />
      ) : null}
    </View>
  );
}
