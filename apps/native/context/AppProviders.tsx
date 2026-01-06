import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
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
import { ToastProvider } from "./ToastContext";
import { TranslationProvider } from "./TranslationContext";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("EXPO_PUBLIC_CONVEX_URL environment variable is required");
}

const convex = new ConvexReactClient(convexUrl);

/**
 * Convex service initializer
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
 * Authentication flow:
 * 1. AuthProvider handles OAuth flow with WorkOS via server
 * 2. ConvexProviderWithAuth receives tokens via useAuthForConvex
 * 3. Convex validates the JWT using auth.config.ts
 * 4. ConvexUserSync creates/syncs user records in Convex database
 */
const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <LogProvider>
    <ThemeProvider>
      <AuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
          <ConvexUserSync>
            <TranslationProvider>
              <ConvexInitializer>
                <ToastProvider>
                  <FavoritesProvider>
                    <RecentSearchesProvider>
                      <GestureHandlerRootView>
                        <SafeAreaProvider>{children}</SafeAreaProvider>
                      </GestureHandlerRootView>
                    </RecentSearchesProvider>
                  </FavoritesProvider>
                </ToastProvider>
              </ConvexInitializer>
            </TranslationProvider>
          </ConvexUserSync>
        </ConvexProviderWithAuth>
      </AuthProvider>
    </ThemeProvider>
  </LogProvider>
);

export default AppProviders;
