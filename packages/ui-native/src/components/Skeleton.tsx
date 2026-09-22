import { cva } from "class-variance-authority";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";

/**
 * The native twin of `packages/ui-web/src/components/Skeleton.tsx`.
 *
 * `bg-border-subtle`, not `bg-surface-raised`: in the light theme
 * `surfaceRaised` is white, so a skeleton painted with it would be invisible
 * against the surface it stands in for.
 *
 * No `animate-pulse`, unlike web — a deliberate product difference, not a
 * workaround left in place to dodge a test. NativeWind routes `animate-*`
 * classes through `react-native-reanimated`, and — verified directly, not
 * assumed — `react-native-reanimated`'s own documented Jest mock
 * (`jest.mock("react-native-reanimated", () =>
 * require("react-native-reanimated/mock"))`) does not make this installed
 * version safe to render under `jest-expo`: `mock.ts` itself imports real,
 * non-type-only symbols from `./index`, which requires
 * `react-native-worklets`, whose `NativeWorklets.native.ts` constructs the
 * real native module at import time and throws `WorkletsError: Native part
 * of Worklets doesn't seem to be initialized` — because `react-native-
 * worklets` ships no mock of its own for that relative-path chain to resolve
 * to instead. See `task-4-report.md`'s "Fix round 1" section for the
 * verbatim error and the full chain.
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
