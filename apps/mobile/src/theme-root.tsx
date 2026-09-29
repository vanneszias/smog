import { themeVars } from "@smog/styles/native";
import { useColorScheme } from "nativewind";
import type { ReactElement, ReactNode } from "react";
import { View } from "react-native";

/**
 * Sets the token colour variables for the current scheme, so every class
 * below (`bg-surface`, `text-foreground`, …) follows light or dark mode.
 */
export function ThemeRoot({ children }: { children: ReactNode }): ReactElement {
  const { colorScheme } = useColorScheme();
  return (
    <View
      className="flex-1"
      style={themeVars[colorScheme === "dark" ? "dark" : "light"]}
      testID="theme-root"
    >
      {/* Variables reach descendants, so the page colour sits one level in. */}
      <View className="flex-1 bg-background">{children}</View>
    </View>
  );
}
