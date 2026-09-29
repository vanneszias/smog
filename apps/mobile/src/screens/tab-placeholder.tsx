import { EmptyState, Heading } from "@smog/ui-native";
import type { ReactElement, ReactNode } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * A tab's screen until phase 3 fills it: the tab's title and an empty
 * state. `children` go below (the home screen's settings entry).
 */
export function TabPlaceholder({
  children,
  illustration = 0,
  title,
}: {
  children?: ReactNode;
  illustration?: 0 | 1 | 2;
  title: string;
}): ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pb-8"
      contentContainerStyle={{ paddingTop: insets.top }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Heading className="pt-6" level={1}>
        {title}
      </Heading>
      <EmptyState illustration={illustration} />
      {children}
    </ScrollView>
  );
}
