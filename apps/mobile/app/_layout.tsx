import "../global.css";

import { KitProvider, ToastProvider } from "@smog/ui-native";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { AnalyticsBridge } from "@/analytics";
import { GuestImportSheet } from "@/guest-import-sheet";
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
            <GuestImportSheet />
            <AnalyticsBridge />
          </ToastProvider>
        </KitProvider>
      </ThemeRoot>
    </AppProviders>
  );
}
