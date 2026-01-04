import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import type React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useConvexInit } from "@/hooks/useConvexInit";
import { AuthProvider, useConvexAuth } from "./AuthContext";
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
 * Internal component to initialize Convex services
 */
const ConvexInitializer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useConvexInit();
  return <>{children}</>;
};

/**
 * AppProviders wraps all context providers for global usage.
 * Place this at the root of your app (e.g., in App.tsx) to provide
 * theme, translation, favorites, recent searches, and toast context globally.
 *
 * Authentication flow:
 * 1. AuthProvider handles OAuth flow with WorkOS
 * 2. ConvexProviderWithAuth receives tokens from AuthProvider via useConvexAuth
 * 3. Convex validates the JWT using the auth.config.ts configuration
 */
const AppProviders: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <LogProvider>
    <ThemeProvider>
      <AuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useConvexAuth}>
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
        </ConvexProviderWithAuth>
      </AuthProvider>
    </ThemeProvider>
  </LogProvider>
);

export default AppProviders;
