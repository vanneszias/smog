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
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { surfaceRoles, useSurface } from "../components/surface";
import { cn } from "../lib/cn";
import { hapticCommit, hapticToggle } from "../lib/haptics";
import { ICON_SIZE } from "../lib/icon";
import { easeEnter, MOTION_MS, popSpring } from "../lib/motion";
import { hitSlopFor, useColor } from "../lib/theme";

const favoriteVariants = cva(
  "items-center justify-center rounded-full border active:opacity-80",
  {
    defaultVariants: { size: "md", variant: "ghost" },
    variants: {
      size: { lg: "size-12", md: "size-touch", sm: "size-8" },
      variant: {
        ghost: "border-transparent bg-transparent",
        overlay: "border-border-subtle bg-card",
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

/**
 * The heart toggle: a light tap and a spring pop when it is switched on,
 * the selection tick when it is switched off.
 */
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
  const highlight = useColor("highlight");
  const surface = useSurface();
  const onGreen = surface !== "default";
  const foreground = useColor(surfaceRoles(surface).foreground);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const press = useCallback((): void => {
    // Keeping a gesture is a small commitment (a light tap); letting it go
    // is a plain toggle (the selection tick).
    if (active) {
      hapticToggle();
    } else {
      hapticCommit();
    }
    if (!(active || reducedMotion)) {
      // Out quickly on the enter curve, then the pop spring settles it (the
      // one bounce in the kit); a second tap re-targets from where it is.
      scale.value = withSequence(
        withTiming(tokens.motion.popScale, {
          duration: MOTION_MS.fast,
          easing: easeEnter,
        }),
        withSpring(1, popSpring)
      );
    }
    onToggle(!active);
  }, [active, onToggle, reducedMotion, scale]);
  // On a green surface the heart is white, and orange when set (green on
  // green would vanish).
  const activeColor = onGreen ? highlight : primary;
  const color = active ? activeColor : foreground;
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
