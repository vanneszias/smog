import "../global.css";

import { tokens } from "@smog/styles/tokens";
import { setOptions as setSplashOptions } from "expo-splash-screen";
import type { ReactElement } from "react";
import { AccessibilityInfo } from "react-native";
import { AppShell } from "@/app-shell";
import { initMonitoring, wrapRoot } from "@/monitoring";
import { AppProviders } from "@/providers";

// Before the first render, so a crash at launch is reported too.
initMonitoring();

// The splash cross-fades into Home's green hero instead of cutting (iOS;
// Android keeps its system exit). Not under reduced motion: no motion at all.
AccessibilityInfo.isReduceMotionEnabled()
  .then((reduced) => {
    if (!reduced) {
      setSplashOptions({ duration: tokens.motion.duration.normal, fade: true });
    }
  })
  .catch((error: unknown) => {
    console.error("[launch] Failed to set the splash fade:", error);
  });

/**
 * The tabs sit beneath every screen the root stack pushes, including one
 * the app was launched into from a link (`+native-intent.tsx`), so back
 * from a deep-linked gesture or shared list lands on the tabs (the old
 * app's go-back fix, spec §10).
 */
export const unstable_settings = { initialRouteName: "(tabs)" };

function RootLayout(): ReactElement {
  return (
    <AppProviders>
      <AppShell />
    </AppProviders>
  );
}

// Sentry's root wrapper (touch breadcrumbs, the app-start span) only when
// monitoring runs.
export default wrapRoot(RootLayout);
