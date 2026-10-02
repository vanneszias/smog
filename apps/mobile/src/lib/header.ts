import { useColor } from "@smog/ui-native";
import { useMemo } from "react";

/** The native stack header options every stack in the app shares. */
export interface StackHeaderOptions {
  contentStyle: { backgroundColor: string };
  headerLargeTitleShadowVisible: false;
  headerLargeTitleStyle: { color: string };
  headerShadowVisible: false;
  headerStyle: { backgroundColor: string };
  headerTintColor: string;
  headerTitleStyle: { color: string };
}

/**
 * Themed stack headers: the page background (no hairline), primary tint
 * for the back button and header buttons, and the foreground title (also
 * for large titles).
 */
export function useStackHeaderOptions(): StackHeaderOptions {
  const background = useColor("background");
  const foreground = useColor("foreground");
  const primary = useColor("primary");
  return useMemo(
    () => ({
      contentStyle: { backgroundColor: background },
      headerLargeTitleShadowVisible: false,
      headerLargeTitleStyle: { color: foreground },
      headerShadowVisible: false,
      headerStyle: { backgroundColor: background },
      headerTintColor: primary,
      headerTitleStyle: { color: foreground },
    }),
    [background, foreground, primary]
  );
}
