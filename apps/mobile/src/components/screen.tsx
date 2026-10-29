import { cn } from "@smog/ui-native";
import type { ReactElement, ReactNode } from "react";
import { ScrollView, type ScrollViewProps, View } from "react-native";
import { ConnectionBanner } from "@/components/connection-banner";

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

/*
 * A large title (Favorites, Lists, Search) lays the screen out under the
 * header on iOS and only a scroller with automatic insets is moved below
 * it: anything else under the header is hidden behind it (the empty
 * states lost their picture and title, the list touched the header). So
 * everything under a header lives in a scroller, starting with `ListTop`.
 */

/** The bottom of a list's own content container. */
export const LIST_CONTENT = "pb-10";

/**
 * The start of a list's (or a state's) scrolling content: the 16 px under
 * the header and the offline banner. `inset={false}` when the content
 * container already has the gutter (the favorites grid).
 */
export function ListTop({
  children,
  className,
  inset = true,
}: {
  children?: ReactNode;
  className?: string;
  inset?: boolean;
}): ReactElement {
  return (
    <View className={cn("gap-2 pt-4", className)}>
      <ConnectionBanner className={inset ? undefined : "mx-0"} />
      {children}
    </View>
  );
}

/**
 * A page that holds one virtualised list (a grid or a FlatList with
 * automatic insets, `ListTop` as its header and `LIST_CONTENT` on its
 * content) or, in its place, a `ListState`.
 */
export function ListScreen({
  children,
  testID,
}: {
  children: ReactNode;
  testID?: string;
}): ReactElement {
  return (
    <View className="flex-1 bg-background" testID={testID}>
      {children}
    </View>
  );
}

/** A loading, empty or error state in place of the list, in a scroller of its own so it clears the header too. */
export function ListState({
  children,
  testID = "list-state",
}: {
  children: ReactNode;
  testID?: string;
}): ReactElement {
  return (
    <ScrollView
      contentContainerClassName="grow pb-10"
      contentInsetAdjustmentBehavior="automatic"
      testID={testID}
    >
      <ListTop className="grow">{children}</ListTop>
    </ScrollView>
  );
}
