import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import {
  Stack,
  usePathname,
  useRootNavigationState,
  useRouter,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { AnalyticsConsentPrompt } from "@/components/AnalyticsConsentPrompt";
import { ListPickerBottomSheet } from "@/components/lists/ListPickerBottomSheet";
import AppProviders from "@/context/AppProviders";
import { useAuth } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/context/TranslationContext";
import {
  clearAnalyticsIdentity,
  getAnalyticsConsent,
  identifyAnalyticsGuest,
  identifyAnalyticsUser,
  initializeOpenPanel,
  subscribeAnalyticsConsent,
  trackScreenView,
} from "@/lib/openpanel";
// Initialize i18n configuration
import "@/utils/i18n";

import logger from "@/utils/logger";

// Keep home underneath deep-linked detail screens so users can navigate back.
export const unstable_settings = {
  initialRouteName: "(tabs)",
};

function NativeAnalytics({
  showConsentPrompt,
}: {
  showConsentPrompt: boolean;
}) {
  const pathname = usePathname();
  const { guestId, isGuest, isLoading, user } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const identifiedProfileId = useRef<string | null>(null);
  const analyticsConsent = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsConsent,
    getAnalyticsConsent
  );

  useEffect(() => {
    initializeOpenPanel().finally(() => setIsInitialized(true));
  }, []);

  useEffect(() => {
    if (!(isInitialized && analyticsConsent === true)) {
      identifiedProfileId.current = null;
      return;
    }
    if (isLoading) {
      return;
    }

    const nextProfileId = user?.id ?? (isGuest && guestId ? guestId : null);
    if (identifiedProfileId.current === nextProfileId) {
      return;
    }
    if (identifiedProfileId.current) {
      clearAnalyticsIdentity();
    }

    if (user) {
      identifyAnalyticsUser(user);
    } else if (isGuest && guestId) {
      identifyAnalyticsGuest(guestId);
    }
    identifiedProfileId.current = nextProfileId;
  }, [analyticsConsent, guestId, isGuest, isInitialized, isLoading, user]);

  useEffect(() => {
    if (isInitialized && analyticsConsent === true && !isLoading) {
      trackScreenView(pathname);
    }
  }, [analyticsConsent, isInitialized, isLoading, pathname]);

  return (
    <AnalyticsConsentPrompt
      visible={showConsentPrompt && isInitialized && analyticsConsent === null}
    />
  );
}

// Shared header configuration per platform
function useHeaderOptions() {
  const { theme } = useTheme();
  const isIOS = Platform.OS === "ios";

  // iOS: translucent blur headers (automatic liquid glass on iOS 26)
  // Android: opaque Material-style colored headers
  const defaultScreenOptions = isIOS
    ? {
        headerBlurEffect: "systemChromeMaterial" as const,
        headerShadowVisible: false,
        headerStyle: {
          backgroundColor: "transparent",
        },
        headerTintColor: theme.primary,
        headerTitleStyle: {
          color: theme.text,
          fontSize: 17,
          fontWeight: "600" as const,
        },
        headerTransparent: true,
      }
    : {
        headerStyle: {
          backgroundColor: theme.primary,
        },
        headerTintColor: theme.background,
        headerTitleStyle: {
          fontSize: 20,
          fontWeight: "bold" as const,
        },
      };

  return { defaultScreenOptions, isIOS };
}

function AuthenticatedLayout() {
  const { theme } = useTheme();
  const { defaultScreenOptions, isIOS } = useHeaderOptions();

  // Set Android navigation bar color to match theme
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setBackgroundColorAsync(theme.card);
      NavigationBar.setButtonStyleAsync(
        theme.statusBar === "light" ? "light" : "dark"
      );
    }
  }, [theme]);

  return (
    <>
      <Stack initialRouteName="(tabs)">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        <Stack.Screen
          name="gestures/[id]"
          options={{
            ...defaultScreenOptions,
            gestureEnabled: true,
            presentation: isIOS ? "card" : "modal",
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            ...defaultScreenOptions,
            gestureEnabled: true,
            presentation: isIOS ? "card" : "modal",
          }}
        />
        <Stack.Screen
          name="settings/developer-tools"
          options={{
            ...defaultScreenOptions,
            gestureEnabled: true,
            presentation: isIOS ? "card" : "modal",
            title: "Developer Tools",
          }}
        />
        <Stack.Screen
          name="settings/account"
          options={{
            ...defaultScreenOptions,
            gestureEnabled: true,
            presentation: isIOS ? "card" : "modal",
          }}
        />
      </Stack>
      <StatusBar
        backgroundColor={
          Platform.OS === "android" ? theme.primary : "transparent"
        }
        style={theme.statusBar}
        translucent={Platform.OS === "android"}
      />
    </>
  );
}

function RootLayoutNav() {
  const {
    isLoading,
    isHandlingOAuthCallback,
    isAuthenticated,
    isGuest,
    authMode,
  } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const [hasNavigated, setHasNavigated] = useState(false);
  const prevAuthMode = useRef(authMode);

  // Only log when auth mode actually changes
  if (prevAuthMode.current !== authMode) {
    logger.log(
      "RootLayoutNav - authMode changed:",
      prevAuthMode.current,
      "->",
      authMode
    );
    prevAuthMode.current = authMode;
  }

  // Let Expo Router keep the initial deep link after session restoration.
  useEffect(() => {
    if (
      navigationState?.key &&
      !(isLoading || isHandlingOAuthCallback || hasNavigated)
    ) {
      if (isAuthenticated || isGuest) {
        if (pathname === "/welcome") {
          router.replace("/(tabs)");
        }
        setHasNavigated(true);
      } else {
        logger.log("User is not authenticated - initial navigation to auth");
        router.replace("/welcome");
        setHasNavigated(true);
      }
    }
  }, [
    isLoading,
    isHandlingOAuthCallback,
    isAuthenticated,
    isGuest,
    router,
    pathname,
    navigationState?.key,
    hasNavigated,
  ]);

  // Reset navigation flag when auth mode actually changes (not immediately)
  useEffect(() => {
    if (prevAuthMode.current !== authMode) {
      setHasNavigated(false);
    }
  }, [authMode]);

  // Show loading while determining auth state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Image
          resizeMode="contain"
          source={require("@/assets/images/adaptive-icon.png")}
          style={styles.logo}
        />
        <Text style={styles.loading}>{t("common.initializing")}</Text>
      </View>
    );
  }

  // Show main app for authenticated users and guests
  if (isAuthenticated || isGuest) {
    return <AuthenticatedLayout />;
  }

  // If not authenticated and not guest, show auth flow
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "SpaceMono-Regular": require("@/assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AppProviders>
      <BottomSheetModalProvider>
        <NativeAnalytics showConsentPrompt />
        <RootLayoutNav />
        <ListPickerBottomSheet />
      </BottomSheetModalProvider>
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loading: {
    color: "white",
    fontSize: 16,
    marginTop: 20,
  },
  loadingContainer: {
    alignItems: "center",
    backgroundColor: "#22805F",
    flex: 1,
    justifyContent: "center",
  },
  logo: {
    height: 150,
    width: 220,
  },
});
