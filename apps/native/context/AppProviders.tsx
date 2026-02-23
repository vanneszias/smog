import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import {
  ConvexProvider,
  ConvexProviderWithAuth,
  ConvexReactClient,
} from "convex/react";
import type React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useConvexInit } from "@/hooks/useConvexInit";
import { AuthProvider, useAuthForConvex } from "./AuthProvider";
import { ConvexUserSync } from "./ConvexUserSync";
import FavoritesProvider from "./FavoritesContext";
import { LogProvider } from "./logs/LogProvider";
import RecentSearchesProvider from "./RecentSearchesContext";
import ThemeProvider from "./ThemeContext";
import { TranslationProvider } from "./TranslationContext";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL environment variable is required");
}

const convex = new ConvexReactClient(convexUrl);

/**
 * Convex service initializer - initializes database and sync service
 * This runs at app startup to ensure data is ready before user navigation
 */
const ConvexInitializer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useConvexInit();
  return <>{children}</>;
};

/**
 * AppProviders wraps all context providers for global usage.
 *
 * Initialization flow:
 * 1. ConvexInitializer initializes database and sync service (runs for all users)
 * 2. AuthProvider handles OAuth flow with WorkOS via server
 * 3. ConvexProviderWithAuth receives tokens via useAuthForConvex
 * 4. Convex validates the JWT using auth.config.ts
 * 5. ConvexUserSync creates/syncs user records in Convex database
 *
 * Note: ConvexInitializer is placed inside ConvexProvider but outside ConvexProviderWithAuth
 * so it initializes the database even for unauthenticated users.
 */
const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <LogProvider>
    <ThemeProvider>
      <AuthProvider>
        <ConvexProvider client={convex}>
          <ConvexInitializer>
            <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
              <ConvexUserSync>
                <TranslationProvider>
                  <FavoritesProvider>
                    <RecentSearchesProvider>
                      <GestureHandlerRootView>
                        <SafeAreaProvider>
                          <ActionSheetProvider>{children}</ActionSheetProvider>
                        </SafeAreaProvider>
                      </GestureHandlerRootView>
                    </RecentSearchesProvider>
                  </FavoritesProvider>
                </TranslationProvider>
              </ConvexUserSync>
            </ConvexProviderWithAuth>
          </ConvexInitializer>
        </ConvexProvider>
      </AuthProvider>
    </ThemeProvider>
  </LogProvider>
);

export default AppProviders;
