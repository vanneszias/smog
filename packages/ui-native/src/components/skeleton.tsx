import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement, Ref } from "react";
import { View, type ViewProps } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { cn } from "../lib/cn";

const skeletonVariants = cva("bg-surface-sunken", {
  defaultVariants: { shape: "rect" },
  variants: {
    shape: {
      circle: "size-10 rounded-full",
      rect: "h-16 w-full rounded-md",
      text: "h-4 w-full rounded-sm",
    },
  },
});

export interface SkeletonProps
  extends Omit<ViewProps, "children">,
    VariantProps<typeof skeletonVariants> {
  ref?: Ref<View>;
}

/**
 * A loading placeholder. Decorative (hidden from VoiceOver/TalkBack; mark
 * the region busy instead); no pulse under reduced motion.
 */
export function Skeleton({
  className,
  shape,
  ...props
}: SkeletonProps): ReactElement {
  const reducedMotion = useReducedMotion();
  return (
    <View
      accessibilityElementsHidden
      className={cn(
        skeletonVariants({ shape }),
        !reducedMotion && "animate-pulse",
        className
      )}
      importantForAccessibility="no-hide-descendants"
      {...props}
    />
  );
}
