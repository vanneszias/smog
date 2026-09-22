import "../global.css";

import { ToastProvider } from "@smog/ui-native";
import { getLocales } from "expo-localization";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";
import {
  ConsentBanner,
  useConsentBannerVisible,
} from "@/components/ConsentBanner";
import { useConsentSync } from "@/lib/consentSync";
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

/**
 * The navigator, plus the consent banner sitting below it in flow rather
 * than over it. While the banner is visible it owns the bottom safe-area
 * inset itself (see `Banner`'s own comment), so the navigator's subtree is
 * told that inset is already spent — otherwise the tab bar pads itself a
 * second time for a home indicator the banner is already sitting on.
 */
function Navigator() {
  useConsentSync();
  const insets = useSafeAreaInsets();
  const bannerVisible = useConsentBannerVisible();

  return (
    <View className="flex-1">
      <SafeAreaInsetsContext.Provider
        value={bannerVisible ? { ...insets, bottom: 0 } : insets}
      >
        <View className="flex-1">
          <Stack screenOptions={{ headerShown: false }} />
        </View>
      </SafeAreaInsetsContext.Provider>
      <ConsentBanner />
    </View>
  );
}

export default function RootLayout() {
  useInitialLocale();

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ToastProvider>
          <Navigator />
        </ToastProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
