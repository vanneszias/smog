import { useTranslation } from "@smog/i18n/react";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import type { ReactElement, ReactNode, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";
import { Button } from "./button";
import { Heading, Text } from "./text";

export interface ErrorStateProps extends Omit<ViewProps, "children"> {
  description?: ReactNode;
  /** Web's heading level; native has one `header` role. */
  level?: 2 | 3 | 4;
  /** Shows a retry button (`states.retry`). */
  onRetry?: () => void;
  ref?: Ref<View>;
  /** Busy state of the retry button while it reloads. */
  retrying?: boolean;
  title?: ReactNode;
}

/** A data view failed to load: title, description and retry (`states.error.*` by default). */
export function ErrorState({
  className,
  description,
  level: _level,
  onRetry,
  retrying = false,
  title,
  ...props
}: ErrorStateProps): ReactElement {
  const { t } = useTranslation();
  const iconColor = useColor("dangerStrong");
  return (
    <View className={cn("items-center gap-3 px-4 py-10", className)} {...props}>
      <View
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        // One announcement (title + description); retry stays its own element.
        accessible
        className="items-center gap-3"
      >
        <View
          accessibilityElementsHidden
          className="mb-1 size-12 items-center justify-center rounded-full bg-danger-subtle"
          importantForAccessibility="no-hide-descendants"
        >
          <CircleAlert color={iconColor} size={ICON_SIZE.lg} />
        </View>
        <Heading className="text-center" size="title-3">
          {title ?? t("states.error.title")}
        </Heading>
        <Text className="text-center" tone="muted">
          {description ?? t("states.error.description")}
        </Text>
      </View>
      {onRetry ? (
        <Button
          className="mt-2"
          icon={<RotateCw />}
          loading={retrying}
          onPress={onRetry}
          variant="secondary"
        >
          {t("states.retry")}
        </Button>
      ) : null}
    </View>
  );
}
