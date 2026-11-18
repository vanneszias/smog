import { useTranslation } from "@smog/i18n/react";
import { type ColorRole, tokens } from "@smog/styles/tokens";
import { cva, type VariantProps } from "class-variance-authority";
import Check from "lucide-react-native/icons/check";
import X from "lucide-react-native/icons/x";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
} from "react";
import {
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  Text,
  View,
} from "react-native";
import { cn } from "../lib/cn";
import { hapticToggle } from "../lib/haptics";
import { ICON_SIZE, renderIcon, textOf } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";

const chipVariants = cva(
  "flex-row items-center gap-1 self-start rounded-full border active:opacity-80",
  {
    compoundVariants: [
      {
        className: "border-highlight-strong bg-highlight",
        selected: true,
        tone: "action",
      },
    ],
    defaultVariants: { selected: false, size: "md", tone: "default" },
    variants: {
      selected: {
        false: "border-muted-foreground bg-card",
        true: "border-primary bg-primary-subtle",
      },
      size: {
        md: "min-h-touch px-4",
        // Dense filters; hitSlop keeps a 44 pt target.
        sm: "min-h-8 px-3",
      },
      /** `action`: a selected chip is the orange "do it" (the active filter). */
      tone: { action: "", default: "" },
    },
  }
);

const chipLabelVariants = cva("font-medium", {
  compoundVariants: [
    { className: "text-highlight-foreground", selected: true, tone: "action" },
  ],
  defaultVariants: { selected: false, size: "md", tone: "default" },
  variants: {
    selected: { false: "text-foreground", true: "text-primary-strong" },
    size: { md: "text-body-sm", sm: "text-caption" },
    tone: { action: "", default: "" },
  },
});

const HEIGHT = { md: tokens.touchTarget, sm: tokens.spacing["8"] } as const;
const REMOVE_SIZE = tokens.spacing["8"];

export interface ChipProps
  extends Omit<PressableProps, "children" | "style">,
    Omit<VariantProps<typeof chipVariants>, "selected"> {
  children?: ReactNode;
  className?: string;
  /** A leading decorative icon (replaced by a check while selected). */
  icon?: ReactNode;
  /** Shows a trailing remove button named `a11y.remove`. */
  onRemove?: () => void;
  /** Called with the next selected state. */
  onSelectedChange?: (selected: boolean) => void;
  ref?: Ref<View>;
  /** Makes the chip a toggle (`togglebutton`, checked while selected). */
  selected?: boolean;
}

/** A pill-shaped filter or tag; selectable (`selected`) and/or removable (`onRemove`). */
export function Chip({
  accessibilityState,
  children,
  className,
  disabled: disabledProp,
  icon,
  onPress,
  onRemove,
  onSelectedChange,
  selected,
  size,
  tone,
  ...props
}: ChipProps): ReactElement {
  // PressableProps allow `null`.
  const disabled = disabledProp === true;
  const { t } = useTranslation();
  const resolvedSize = size ?? "md";
  const isToggle = selected !== undefined;
  const isSelected = selected ?? false;
  const action = isSelected && tone === "action";
  let labelRole: ColorRole = isSelected ? "primaryStrong" : "foreground";
  if (action) {
    labelRole = "highlightForeground";
  }
  const labelColor = useColor(labelRole);
  const mutedColor = useColor("mutedForeground");
  const handlePress = useCallback(
    (event: GestureResponderEvent): void => {
      onPress?.(event);
      if (isToggle) {
        hapticToggle();
        onSelectedChange?.(!selected);
      }
    },
    [isToggle, onPress, onSelectedChange, selected]
  );
  const leading = isSelected ? <Check /> : icon;
  const chip = (
    <Pressable
      accessibilityRole={isToggle ? "togglebutton" : "button"}
      accessibilityState={{
        ...accessibilityState,
        checked: isToggle ? isSelected : undefined,
        disabled,
      }}
      className={cn(
        chipVariants({ selected: isSelected, size: resolvedSize, tone }),
        onRemove && "pr-10",
        disabled && "opacity-50",
        className
      )}
      disabled={disabled}
      hitSlop={hitSlopFor(HEIGHT[resolvedSize])}
      onPress={handlePress}
      {...props}
    >
      {renderIcon(leading, labelColor, ICON_SIZE.sm)}
      {typeof children === "string" || typeof children === "number" ? (
        <Text
          className={cn(
            chipLabelVariants({
              selected: isSelected,
              size: resolvedSize,
              tone,
            })
          )}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
  if (!onRemove) {
    return chip;
  }
  return (
    <View className="relative self-start">
      {chip}
      <View
        className="absolute inset-y-0 right-1 justify-center"
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityLabel={t("a11y.remove", { label: textOf(children) })}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          className="size-8 items-center justify-center rounded-full active:bg-surface-sunken"
          disabled={disabled}
          hitSlop={hitSlopFor(REMOVE_SIZE)}
          onPress={onRemove}
        >
          {renderIcon(<X />, mutedColor, ICON_SIZE.sm)}
        </Pressable>
      </View>
    </View>
  );
}
