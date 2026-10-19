import { handSvgs } from "@smog/brand/svg";
import { useTranslation } from "@smog/i18n/react";
import { tokens } from "@smog/styles/tokens";
import type { ReactElement, ReactNode, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { SvgXml } from "react-native-svg";
import { cn } from "../lib/cn";
import { ICON_SIZE, renderIcon } from "../lib/icon";
import { useColor } from "../lib/theme";
import { Heading, Text } from "./text";

export interface EmptyStateProps extends Omit<ViewProps, "children"> {
  /** The next action (spec §16: every empty state offers one). */
  action?: ReactNode;
  description?: ReactNode;
  /** A decorative icon above the title. */
  icon?: ReactNode;
  /** Show one of the brand hands (index into `handSvgs`, `true` = the first). */
  illustration?: boolean | 0 | 1 | 2;
  /** Web's heading level; native has one `header` role. */
  level?: 1 | 2 | 3 | 4;
  ref?: Ref<View>;
  title?: ReactNode;
}

const ILLUSTRATION_HEIGHT = tokens.spacing["16"];

/** No data yet: title, description and the next action (`states.empty.*` by default). */
export function EmptyState({
  action,
  className,
  description,
  icon,
  illustration,
  level: _level,
  title,
  ...props
}: EmptyStateProps): ReactElement {
  const { t } = useTranslation();
  const primary = useColor("primary");
  const iconColor = useColor("primaryStrong");
  const hand =
    illustration === undefined || illustration === false
      ? null
      : handSvgs[illustration === true ? 0 : illustration];
  return (
    <View className={cn("items-center gap-3 px-4 py-10", className)} {...props}>
      {hand ? (
        <View
          accessibilityElementsHidden
          className="mb-2"
          importantForAccessibility="no-hide-descendants"
        >
          <SvgXml
            color={primary}
            height={ILLUSTRATION_HEIGHT}
            width={ILLUSTRATION_HEIGHT}
            xml={hand}
          />
        </View>
      ) : null}
      {icon && !hand ? (
        <View className="mb-1 size-12 items-center justify-center rounded-full bg-primary-subtle">
          {renderIcon(icon, iconColor, ICON_SIZE.lg)}
        </View>
      ) : null}
      <Heading className="text-center" size="title-3">
        {title ?? t("states.empty.title")}
      </Heading>
      <Text className="text-center" tone="muted">
        {description ?? t("states.empty.description")}
      </Text>
      {action ? (
        <View className="mt-2 flex-row flex-wrap justify-center gap-2">
          {action}
        </View>
      ) : null}
    </View>
  );
}
