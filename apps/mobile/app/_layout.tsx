import "../global.css";

import type { ReactElement } from "react";
import { AppShell } from "@/app-shell";
import { initMonitoring, wrapRoot } from "@/monitoring";
import { AppProviders } from "@/providers";

// Before the first render, so a crash at launch is reported too.
initMonitoring();

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
