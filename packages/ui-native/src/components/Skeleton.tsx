import { cva } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

/**
 * The native twin of `packages/ui-web/src/components/Skeleton.tsx`.
 *
 * `bg-border-subtle`, not `bg-surface-raised`: in the light theme
 * `surfaceRaised` is white, so a skeleton painted with it would be invisible
 * against the surface it stands in for.
 */
export const skeletonVariants = cva("rounded-md bg-border-subtle");

export type SkeletonProps = ViewProps & { className?: string };

/**
 * A loading placeholder.
 *
 * Hidden from assistive technology by default (`accessibilityElementsHidden`
 * on iOS, `importantForAccessibility="no-hide-descendants"` on Android): a
 * pulsing rectangle has nothing to say, and a screen reader that walks into a
 * dozen of them hears a dozen blank groups. The loading state belongs on the
 * region being replaced, not on the placeholder itself.
 */
export function Skeleton({
  className,
  testID = "root",
  ...props
}: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      className={cn(skeletonVariants(), className)}
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      {...props}
    />
  );
}
