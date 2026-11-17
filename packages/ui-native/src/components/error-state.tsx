import { handSvgs } from "@smog/brand/svg";
import { useTranslation } from "@smog/i18n/react";
import { tokens } from "@smog/styles/tokens";
import RotateCw from "lucide-react-native/icons/rotate-cw";
import type { ReactElement, ReactNode, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { SvgXml } from "react-native-svg";
import { cn } from "../lib/cn";
import { useColor } from "../lib/theme";
import { Button } from "./button";
import { Heading, Text } from "./text";

export interface ErrorStateProps extends Omit<ViewProps, "children"> {
  description?: ReactNode;
  /** Web's heading level; native has one `header` role. */
  level?: 1 | 2 | 3 | 4;
  /** Shows a retry button (`states.retry`). */
  onRetry?: () => void;
  ref?: Ref<View>;
  /** Busy state of the retry button while it reloads. */
  retrying?: boolean;
  title?: ReactNode;
}

/** The open palm inside the disc (the disc is `size-24`). */
const HAND_SIZE = tokens.spacing["12"];

/**
 * A data view failed to load: the brand's open palm in the brand green on
 * a pale red disc (an error you did not cause; the same mark as the web
 * kit, never a stock alert glyph), title, description and retry
 * (`states.error.*` by default). The disc and the title say it is an
 * error, so the state never relies on colour alone.
 */
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
  const handColor = useColor("primary");
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
          className="mb-1 size-24 items-center justify-center rounded-full bg-danger-subtle"
          importantForAccessibility="no-hide-descendants"
          testID="error-illustration"
        >
          <SvgXml
            color={handColor}
            height={HAND_SIZE}
            width={HAND_SIZE}
            xml={handSvgs[2]}
          />
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
