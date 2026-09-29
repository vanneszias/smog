import { useTranslation } from "@smog/i18n/react";
import WifiOff from "lucide-react-native/icons/wifi-off";
import type { ReactElement, Ref } from "react";
import { Text, View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { ICON_SIZE } from "../lib/icon";
import { useColor } from "../lib/theme";

export interface OfflineBannerProps extends Omit<ViewProps, "children"> {
  /**
   * Connectivity, from `@react-native-community/netinfo` in the app. Native
   * has no browser events, so it is required (web falls back to them).
   */
  online: boolean;
  ref?: Ref<View>;
}

/** Shown while the network is lost (`states.offline.*`); a polite live region. */
export function OfflineBanner({
  className,
  online,
  ...props
}: OfflineBannerProps): ReactElement | null {
  const { t } = useTranslation();
  const iconColor = useColor("warningStrong");
  if (online) {
    return null;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      accessible
      className={cn(
        "flex-row items-start gap-3 rounded-md bg-warning-subtle px-4 py-3",
        className
      )}
      {...props}
    >
      <View
        accessibilityElementsHidden
        className="mt-0.5"
        importantForAccessibility="no-hide-descendants"
      >
        <WifiOff color={iconColor} size={ICON_SIZE.md} />
      </View>
      <View className="flex-1 flex-col">
        <Text className="font-semibold text-body-sm text-warning-strong">
          {t("states.offline.title")}
        </Text>
        <Text className="text-body-sm text-foreground">
          {t("states.offline.description")}
        </Text>
      </View>
    </View>
  );
}
