import { cn } from "@smog/ui-native";
import type { ReactElement, ReactNode } from "react";
import { ScrollView, type ScrollViewProps, View } from "react-native";

/*
 * The screen contract every screen under a native stack header follows
 * (issue #9). The header and the tab bar own the safe area: scrollers use
 * automatic content insets (iOS insets them below the header and above the
 * tab bar or home indicator), nothing pads for the status bar by hand, and
 * overscroll keeps the platform's bounce. Content has a 16 px gutter
 * (`px-4`), the same 16 px under the header (`pt-4`) and 40 px of bottom
 * clearance (`pb-10`) on top of the inset.
 *
 * Deliberate exceptions: Home has no header (its green hero runs under the
 * status bar, see `app/(tabs)/index.tsx`), and Search keeps the native
 * large title and search bar with its results in its own scroller (with
 * the same 16 px under the header).
 */

/** A scrolling page under a stack header (settings, account, a gesture, a lesson). */
export function ScreenScrollView({
  contentContainerClassName,
  ...props
}: ScrollViewProps & { contentContainerClassName?: string }): ReactElement {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      {...props}
      contentContainerClassName={cn(
        "px-4 pt-4 pb-10",
        contentContainerClassName
      )}
    />
  );
}

/**
 * A page that holds one virtualised list (a grid or a FlatList with its own
 * automatic insets) and its loading, empty and error states, under the
 * connection banner.
 */
export function ListScreen({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}): ReactElement {
  return (
    <View className="flex-1 gap-2 bg-background pt-4" testID={testID}>
      {children}
    </View>
  );
}
