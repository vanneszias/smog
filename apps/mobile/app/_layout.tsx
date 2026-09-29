import "../global.css";

import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { ThemeRoot } from "@/theme-root";

export default function RootLayout(): ReactElement {
  return (
    <ThemeRoot>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeRoot>
  );
}
