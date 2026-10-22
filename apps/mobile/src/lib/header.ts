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
 * Themed stack headers: the deeper green of the web header (`sidebar`, no
 * hairline) with white title, large title, back button and header buttons
 * (`sidebarForeground`, 4.5:1 and better in `@smog/styles/contrast`); the
 * page below keeps the page background. A screen's own header buttons sit
 * in `HeaderActions` so the kit draws them for the green.
 */
export function useStackHeaderOptions(): StackHeaderOptions {
  const background = useColor("background");
  const header = useColor("sidebar");
  const onHeader = useColor("sidebarForeground");
  return useMemo(
    () => ({
      contentStyle: { backgroundColor: background },
      headerLargeTitleShadowVisible: false,
      headerLargeTitleStyle: { color: onHeader },
      headerShadowVisible: false,
      headerStyle: { backgroundColor: header },
      headerTintColor: onHeader,
      headerTitleStyle: { color: onHeader },
    }),
    [background, header, onHeader]
  );
}
