import { KitProvider, ToastProvider } from "@smog/ui-native";
import { Stack } from "expo-router";
import type { ReactElement } from "react";
import { GuestImportSheet } from "@/guest-import-sheet";
import { type StackHeaderOptions, useStackHeaderOptions } from "@/lib/header";
import { ThemeRoot } from "@/theme-root";

/** A card over the tabs with its own header (title and buttons set by the screen). */
function useCardOptions(): StackHeaderOptions & {
  headerBackButtonDisplayMode: "minimal";
  headerShown: true;
  title: string;
} {
  const header = useStackHeaderOptions();
  return {
    ...header,
    headerBackButtonDisplayMode: "minimal" as const,
    headerShown: true,
    title: "",
  };
}

/**
 * The root stack: the tabs, the sign-in modal, settings, and the gesture
 * and shared list cards, with the kit's providers and the guest import
 * sheet. `app/_layout.tsx` wraps it in `AppProviders`; tests pass fakes.
 */
export function AppShell(): ReactElement {
  const card = useCardOptions();
  return (
    <ThemeRoot>
      <KitProvider>
        <ToastProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="gestures/[slug]" options={card} />
            <Stack.Screen name="shared/[token]" options={card} />
          </Stack>
          <GuestImportSheet />
        </ToastProvider>
      </KitProvider>
    </ThemeRoot>
  );
}
