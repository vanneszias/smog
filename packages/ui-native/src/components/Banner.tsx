import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "../lib/cn";

/**
 * A non-modal notice pinned to the bottom of the screen — `@smog/ui-web`'s
 * `Banner`, in the native idiom.
 *
 * Same philosophy: a labelled region, no scrim, no focus trap, and nothing
 * that stops the app underneath from being used. Different mechanics: the
 * web banner is `fixed` and relies on a spacer; this one is meant to be
 * rendered *in layout flow* below the navigator, so the navigator shrinks
 * and nothing is covered at all. It therefore owns the bottom safe-area
 * inset — the caller should tell the navigator above it that the inset is
 * already spent (see `apps/mobile/app/_layout.tsx`).
 *
 * `16` is the `md` spacing step, added to the inset rather than replacing it.
 */
export type BannerProps = Omit<ViewProps, "children"> & {
  label: string;
  children: ReactNode;
  className?: string;
};

export function Banner({
  children,
  className,
  label,
  style,
  testID = "root",
  ...props
}: BannerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityLabel={label}
      className={cn(
        "gap-sm border-border-subtle border-t bg-surface-raised px-lg pt-md",
        className
      )}
      role="region"
      style={[{ paddingBottom: insets.bottom + 16 }, style]}
      testID={testID}
      {...props}
    >
      {children}
    </View>
  );
}
