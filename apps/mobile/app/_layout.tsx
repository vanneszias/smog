import "../global.css";

import { ToastProvider } from "@smog/ui-native";
import { getLocales } from "expo-localization";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import { setLocale } from "@/lib/i18n";
import { resolveLocale } from "@/lib/locale";
import { SessionProvider } from "@/lib/session";

/**
 * `enableScreens()` is what makes `expo-router`'s native-stack navigator use
 * `react-native-screens` for real: called once, here, before any screen
 * mounts, same as `@react-navigation`'s own setup docs.
 */
enableScreens();

/**
 * Seeds `lib/i18n.ts`'s active locale from the device's own preferred
 * languages, once, at startup — the settings screen only ever *changes* it
 * from here on. Without this, every screen's `t()` opens in
 * {@link DEFAULT_LOCALE} regardless of the device's own setting, the same
 * gap `resolveLocale` already closes for every network request this app
 * makes (`data/gestures.ts` and friends each read `getLocales()` per
 * request); this is the one place that reads it for the *display* language
 * instead, since nothing else in this tree renders before it.
 *
 * There is no `I18nProvider` component: `lib/i18n.ts`'s own module comment
 * explains why `setLocale` is a plain function rather than a context value,
 * and a startup effect is what "provider" reduces to for state that lives
 * outside React already.
 *
 * Theme needs no equivalent effect. NativeWind's `colorScheme` already
 * follows the OS appearance until `setColorScheme` overrides it
 * (`nativewind/dist/stylesheet.js`), so "system" is the default with
 * nothing to seed — see `tailwind.config.js`'s own comment for what does
 * need setting for that override to be callable at all.
 */
function useInitialLocale(): void {
  useEffect(() => {
    setLocale(resolveLocale(getLocales().map((entry) => entry.languageTag)));
  }, []);
}

export default function RootLayout() {
  useInitialLocale();

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
