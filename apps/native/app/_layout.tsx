import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import * as NavigationBar from "expo-navigation-bar";
import { Stack, usePathname, useRouter } from "expo-router";
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
        headerTransparent: true,
        headerBlurEffect: "systemChromeMaterial" as const,
        headerShadowVisible: false,
        headerTintColor: theme.primary,
        headerTitleStyle: {
          fontWeight: "600" as const,
          fontSize: 17,
          color: theme.text,
        },
        headerStyle: {
          backgroundColor: "transparent",
        },
      }
    : {
        headerStyle: {
          backgroundColor: theme.primary,
        },
        headerTintColor: theme.background,
        headerTitleStyle: {
          fontWeight: "bold" as const,
          fontSize: 20,
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
            presentation: isIOS ? "card" : "modal",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            ...defaultScreenOptions,
            presentation: isIOS ? "card" : "modal",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="settings/developer-tools"
          options={{
            ...defaultScreenOptions,
            presentation: isIOS ? "card" : "modal",
            gestureEnabled: true,
            title: "Developer Tools",
          }}
        />
        <Stack.Screen
          name="settings/account"
          options={{
            ...defaultScreenOptions,
            presentation: isIOS ? "card" : "modal",
            gestureEnabled: true,
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

  // Force navigation when auth state changes - but only for initial load
  useEffect(() => {
    if (!(isLoading || isHandlingOAuthCallback || hasNavigated)) {
      if (isAuthenticated || isGuest) {
        logger.log("User is authenticated/guest - initial navigation to tabs");
        router.replace("/(tabs)");
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
  loadingContainer: {
    flex: 1,
    backgroundColor: "#22805F",
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 220,
    height: 150,
  },
  loading: {
    marginTop: 20,
    color: "white",
    fontSize: 16,
  },
});
