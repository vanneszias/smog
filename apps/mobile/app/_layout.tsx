import "../global.css";

import { ToastProvider } from "@smog/ui-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { SessionProvider } from "@/lib/session";

/**
 * `enableScreens()` is what makes `expo-router`'s native-stack navigator use
 * `react-native-screens` for real: called once, here, before any screen
 * mounts, same as `@react-navigation`'s own setup docs.
 */
enableScreens();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
