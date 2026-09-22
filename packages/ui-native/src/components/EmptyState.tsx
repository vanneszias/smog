import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "../lib/cn";
import { Text } from "./Text";

export const emptyStateVariants = cva(
  "items-center gap-sm rounded-lg border border-border-subtle border-dashed p-xl"
);

export type EmptyStateProps = ViewProps & {
  /** Always rendered, as a heading — an empty state without one says nothing. */
  title: string;
  description?: string;
  /** Usually a `Button` — the way out of the empty state. */
  action?: ReactNode;
  className?: string;
};

/**
 * The native twin of `packages/ui-web/src/components/EmptyState.tsx`. What a
 * list looks like when it has nothing in it.
 *
 * `accessibilityRole="header"` on the title, because that is the one role a
 * screen reader can jump between: without it, an empty state that replaces a
 * list's contents reads as an anonymous block of text instead of the heading
 * for what a user landed on.
 */
export function EmptyState({
  action,
  className,
  description,
  testID = "root",
  title,
  ...props
}: EmptyStateProps) {
  return (
    <View
      className={cn(emptyStateVariants(), className)}
      testID={testID}
      {...props}
    >
      <Text accessibilityRole="header" testID="title" variant="heading">
        {title}
      </Text>
      {description == null ? null : (
        <Text className="text-center" testID="description" variant="muted">
          {description}
        </Text>
      )}
      {action == null ? null : <View className="pt-sm">{action}</View>}
    </View>
  );
}
