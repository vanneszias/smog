import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useFonts } from "expo-font";
import { SplashScreen, Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import GlobalOfflineBanner from "@/components/common/GlobalOfflineBanner";
import RiveSplashScreen from "@/components/RiveSplashScreen";
import AppProviders from "@/context/AppProviders";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
// Initialize i18n configuration
import "@/utils/i18n";

// PostHog
import { PostHogProvider } from "posthog-react-native";
import { useAutoSync } from "@/hooks/useAutoSync";
import posthog, {
  autocaptureConfig,
  initializeAnalytics,
  trackAppBackgrounded,
  trackAppOpened,
} from "@/services/analyticsService";

// Regex patterns for app state detection
const INACTIVE_OR_BACKGROUND_REGEX = /inactive|background/;

// Keep the default splash visible while we load resources
SplashScreen.preventAutoHideAsync();

function AuthenticatedLayout() {
  const { theme } = useTheme();

  // Auto-sync when app comes to foreground
  useAutoSync();

  return (
    <>
      <GlobalOfflineBanner />
      <Stack initialRouteName="(tabs)">
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="gestures/[id]"
          options={{
            headerStyle: {
              backgroundColor: theme.primary,
            },
            headerTintColor: theme.background,
            headerTitleStyle: {
              fontWeight: Platform.OS === "ios" ? "600" : "bold",
              fontSize: Platform.OS === "ios" ? 17 : 20,
            },
            presentation: Platform.OS === "ios" ? "card" : "modal",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="settings/index"
          options={{
            headerStyle: {
              backgroundColor: theme.primary,
            },
            headerTintColor: theme.background,
            headerTitleStyle: {
              fontWeight: Platform.OS === "ios" ? "600" : "bold",
              fontSize: Platform.OS === "ios" ? 17 : 20,
            },
            presentation: Platform.OS === "ios" ? "card" : "modal",
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="settings/developer-tools"
          options={{
            headerStyle: {
              backgroundColor: theme.primary,
            },
            headerTintColor: theme.background,
            headerTitleStyle: {
              fontWeight: Platform.OS === "ios" ? "600" : "bold",
              fontSize: Platform.OS === "ios" ? 17 : 20,
            },
            presentation: Platform.OS === "ios" ? "card" : "modal",
            gestureEnabled: true,
            title: "Developer Tools",
          }}
        />
        <Stack.Screen
          name="settings/account"
          options={{
            headerStyle: {
              backgroundColor: theme.primary,
            },
            headerTintColor: theme.background,
            headerTitleStyle: {
              fontWeight: Platform.OS === "ios" ? "600" : "bold",
              fontSize: Platform.OS === "ios" ? 17 : 20,
            },
            presentation: Platform.OS === "ios" ? "card" : "modal",
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
  const { isLoading, isAuthenticated, isGuest, authMode } = useAuth();
  const router = useRouter();
  const [hasNavigated, setHasNavigated] = useState(false);
  const prevAuthMode = useRef(authMode);

  // Only log when auth mode actually changes
  if (prevAuthMode.current !== authMode) {
    console.log(
      "RootLayoutNav - authMode changed:",
      prevAuthMode.current,
      "->",
      authMode
    );
    prevAuthMode.current = authMode;
  }

  // Force navigation when auth state changes - but only for initial load
  useEffect(() => {
    if (!(isLoading || hasNavigated)) {
      if (isAuthenticated || isGuest) {
        console.log("User is authenticated/guest - initial navigation to tabs");
        router.replace("/(tabs)");
        setHasNavigated(true);
      } else {
        console.log("User is not authenticated - initial navigation to auth");
        router.replace("/welcome");
        setHasNavigated(true);
      }
    }
  }, [isLoading, isAuthenticated, isGuest, router, hasNavigated]);

  // Reset navigation flag when auth mode actually changes (not immediately)
  useEffect(() => {
    if (prevAuthMode.current !== authMode) {
      setHasNavigated(false);
    }
  }, [authMode]);

  // Show loading while determining auth state
  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <Image
          resizeMode="contain"
          source={require("@/assets/images/adaptive-icon.png")}
          style={styles.logo}
        />
        <Text style={styles.loading}>Initializing...</Text>
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

  const [showSplash, setShowSplash] = useState(true);

  // App lifecycle tracking
  const appStateRef = useRef(AppState.currentState);
  const sessionStartTimeRef = useRef<number | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const isFirstLaunchRef = useRef(true);

  useEffect(() => {
    if (fontsLoaded) {
      // Don't automatically hide splash after timeout anymore
      // Let the Rive animation control when to hide
      SplashScreen.hideAsync();

      // Initialize analytics based on user consent
      initializeAnalytics();

      // Track app opened on first load
      if (isFirstLaunchRef.current) {
        trackAppOpened(true);
        sessionStartTimeRef.current = Date.now();
        isFirstLaunchRef.current = false;
      }
    }
  }, [fontsLoaded]);

  // App state change tracking
  useEffect(() => {
    const handleAppToForeground = (currentTime: number) => {
      if (!isFirstLaunchRef.current) {
        const timeSinceLastActive = currentTime - lastActiveTimeRef.current;
        trackAppOpened(false, Math.round(timeSinceLastActive / 1000 / 60));
      }
      sessionStartTimeRef.current = currentTime;
    };

    const handleAppToBackground = (currentTime: number) => {
      if (sessionStartTimeRef.current) {
        const sessionDuration = Math.round(
          (currentTime - sessionStartTimeRef.current) / 1000
        );
        trackAppBackgrounded(sessionDuration);
      }
      lastActiveTimeRef.current = currentTime;
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const currentTime = Date.now();
      const isComingToForeground =
        appStateRef.current.match(INACTIVE_OR_BACKGROUND_REGEX) &&
        nextAppState === "active";
      const isGoingToBackground =
        appStateRef.current === "active" &&
        nextAppState.match(INACTIVE_OR_BACKGROUND_REGEX);

      if (isComingToForeground) {
        handleAppToForeground(currentTime);
      } else if (isGoingToBackground) {
        handleAppToBackground(currentTime);
      }

      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => subscription?.remove();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PostHogProvider autocapture={autocaptureConfig} client={posthog}>
      <AppProviders>
        {showSplash ? (
          <RiveSplashScreen onAnimationComplete={() => setShowSplash(false)} />
        ) : (
          <BottomSheetModalProvider>
            <RootLayoutNav />
          </BottomSheetModalProvider>
        )}
      </AppProviders>
    </PostHogProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
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
