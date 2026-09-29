import "../global.css";

import { KitProvider, ToastProvider } from "@smog/ui-native";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { AppProviders } from "@/providers";
import { ThemeRoot } from "@/theme-root";

export default function RootLayout(): ReactElement {
  return (
    <AppProviders>
      <ThemeRoot>
        <KitProvider>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
              <Stack.Screen name="settings" />
            </Stack>
          </ToastProvider>
        </KitProvider>
      </ThemeRoot>
    </AppProviders>
  );
}
