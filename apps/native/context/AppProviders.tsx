import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import logger from "@/utils/logger";
import { AuthProvider, useAuthForConvex } from "./AuthProvider";
import { ConvexUserSync } from "./ConvexUserSync";
import FavoritesProvider from "./FavoritesContext";
import { LogProvider } from "./logs/LogProvider";
import RecentSearchesProvider from "./RecentSearchesContext";
import ThemeProvider from "./ThemeContext";
import { TranslationProvider } from "./TranslationContext";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

const createConvexClient = (): ConvexReactClient | null => {
  if (!convexUrl) {
    logger.error("[AppProviders] Missing EXPO_PUBLIC_CONVEX_URL.");
    return null;
  }

  try {
    return new ConvexReactClient(convexUrl);
  } catch (error) {
    logger.error("[AppProviders] Invalid EXPO_PUBLIC_CONVEX_URL:", error);
    return null;
  }
};

const convex = createConvexClient();

function MissingConfigurationScreen() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.container}>
          <Text style={styles.title}>Configuration unavailable</Text>
          <Text style={styles.message}>
            The app could not connect to its backend configuration. Please
            install the latest build or contact support.
          </Text>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * AppProviders wraps all context providers for global usage.
 *
 * Initialization flow:
 * 1. AuthProvider handles OAuth flow with WorkOS via server
 * 2. ConvexProviderWithAuth receives tokens via useAuthForConvex
 * 3. Convex validates the JWT using auth.config.ts
 * 4. ConvexUserSync creates/syncs user records in Convex database
 */
const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  if (!convex) {
    return (
      <LogProvider>
        <MissingConfigurationScreen />
      </LogProvider>
    );
  }

  return (
    <LogProvider>
      <ThemeProvider>
        <AuthProvider>
          <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
            <ConvexUserSync>
              <TranslationProvider>
                <FavoritesProvider>
                  <RecentSearchesProvider>
                    <GestureHandlerRootView style={styles.root}>
                      <SafeAreaProvider>
                        <ActionSheetProvider>{children}</ActionSheetProvider>
                      </SafeAreaProvider>
                    </GestureHandlerRootView>
                  </RecentSearchesProvider>
                </FavoritesProvider>
              </TranslationProvider>
            </ConvexUserSync>
          </ConvexProviderWithAuth>
        </AuthProvider>
      </ThemeProvider>
    </LogProvider>
  );
};

export default AppProviders;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#22805F",
  },
  title: {
    color: "white",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    color: "white",
    fontSize: 16,
    lineHeight: 22,
    maxWidth: 320,
    opacity: 0.9,
    textAlign: "center",
  },
});
