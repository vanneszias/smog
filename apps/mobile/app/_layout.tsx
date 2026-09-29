import "../global.css";

import { setupNative } from "@smog/i18n/native";
import { I18nextProvider } from "@smog/i18n/react";
import { KitProvider, ToastProvider } from "@smog/ui-native";
import { Stack } from "expo-router";
import { type ReactElement, useState } from "react";
import { ThemeRoot } from "@/theme-root";

export default function RootLayout(): ReactElement {
  // The stored language preference joins in Task 9 (local-store).
  const [i18n] = useState(() => setupNative());
  return (
    <ThemeRoot>
      <I18nextProvider i18n={i18n}>
        <KitProvider>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </ToastProvider>
        </KitProvider>
      </I18nextProvider>
    </ThemeRoot>
  );
}
