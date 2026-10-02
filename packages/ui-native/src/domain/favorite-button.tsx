import { useTranslation } from "@smog/i18n/react";
import { tokens } from "@smog/styles/tokens";
import { cva } from "class-variance-authority";
import Heart from "lucide-react-native/icons/heart";
import { type ReactElement, useCallback } from "react";
import { Pressable, type PressableProps } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { cn } from "../lib/cn";
import { hapticToggle } from "../lib/haptics";
import { ICON_SIZE } from "../lib/icon";
import { hitSlopFor, useColor } from "../lib/theme";

const favoriteVariants = cva(
  "items-center justify-center rounded-full border active:opacity-80",
  {
    defaultVariants: { size: "md", variant: "ghost" },
    variants: {
      size: { lg: "size-12", md: "size-touch", sm: "size-8" },
      variant: {
        ghost: "border-transparent bg-transparent",
        overlay: "border-border-subtle bg-surface",
      },
    },
  }
);

const SIZE = {
  lg: tokens.spacing["12"],
  md: tokens.touchTarget,
  sm: tokens.spacing["8"],
} as const;
const ICON = { lg: ICON_SIZE.lg, md: ICON_SIZE.md, sm: ICON_SIZE.sm } as const;

export interface FavoriteButtonProps
  extends Omit<PressableProps, "children" | "style" | "onPress"> {
  active: boolean;
  className?: string;
  /** The accessible name (`a11y.favorite` by default); the state is `checked`. */
  label?: string;
  /** Called with the next state at once (the caller updates optimistically). */
  onToggle: (active: boolean) => void;
  size?: "sm" | "md" | "lg";
  /** `overlay` sits on a thumbnail. */
  variant?: "ghost" | "overlay";
}

/** The heart toggle: the selection haptic, and a pop when it is switched on. */
export function FavoriteButton({
  active,
  className,
  label,
  onToggle,
  size = "md",
  variant,
  ...props
}: FavoriteButtonProps): ReactElement {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const primary = useColor("primary");
  const foreground = useColor("foreground");
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const press = useCallback((): void => {
    hapticToggle();
    if (!(active || reducedMotion)) {
      const half = tokens.motion.duration.slow / 2;
      scale.value = withSequence(
        withTiming(tokens.motion.popScale, { duration: half }),
        withTiming(1, { duration: half })
      );
    }
    onToggle(!active);
  }, [active, onToggle, reducedMotion, scale]);
  const color = active ? primary : foreground;
  return (
    <Pressable
      accessibilityLabel={label ?? t("a11y.favorite")}
      accessibilityRole="togglebutton"
      accessibilityState={{ checked: active }}
      className={cn(favoriteVariants({ size, variant }), className)}
      hitSlop={hitSlopFor(SIZE[size])}
      onPress={press}
      {...props}
    >
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={animatedStyle}
      >
        <Heart
          color={color}
          fill={active ? color : "transparent"}
          size={ICON[size]}
        />
      </Animated.View>
    </Pressable>
  );
}
