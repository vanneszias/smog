import {
  ANDROID_PACKAGE,
  APP_SCHEME,
  APP_STORE_URL,
  PLAY_STORE_URL,
} from "@smog/config/constants";
import { useEffect, useState } from "react";

/** What the browser says about itself (read after hydration). */
export interface BrowserTraits {
  maxTouchPoints: number;
  userAgent: string;
  /** `window.innerWidth`. */
  width: number;
}

export type MobilePlatform = "android" | "ios" | "other";

/** The old site's phone test (inventory L-15). */
const MOBILE_UA =
  /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
const IOS_UA = /iphone|ipad|ipod/i;
const ANDROID_UA = /android/i;
const MAC_UA = /macintosh/i;
const LEADING_SLASHES = /^\/+/;
/** Below `lg` (the old breakpoint): a touch screen this narrow is a tablet. */
const TABLET_MAX_WIDTH = 1024;

/** A phone or tablet: its user agent, or touch on a screen narrower than `lg`. */
export function isMobileBrowser(traits: BrowserTraits): boolean {
  return (
    MOBILE_UA.test(traits.userAgent) ||
    (traits.maxTouchPoints > 0 && traits.width < TABLET_MAX_WIDTH)
  );
}

/** iOS (iPadOS says "Macintosh" but has touch), Android, or anything else. */
export function mobilePlatform(traits: BrowserTraits): MobilePlatform {
  if (
    IOS_UA.test(traits.userAgent) ||
    (MAC_UA.test(traits.userAgent) && traits.maxTouchPoints > 1)
  ) {
    return "ios";
  }
  return ANDROID_UA.test(traits.userAgent) ? "android" : "other";
}

export interface OpenInAppPlan {
  /** The link that opens the app. */
  href: string;
  /** A separate "Get the app" link the page shows (iOS). */
  storeUrl?: string;
}

/**
 * How "Open in the app" opens `path` (a site path, already encoded, that
 * `+native-intent.tsx` maps: `/gestures/<slug>`, `/lists/<token>`).
 *
 * The button's own `href` is the universal link, but a universal link to
 * the page one is already on stays in the browser (iOS and Android both
 * ignore same-site taps). So on a phone the click goes through the app:
 * - Android: an `intent:` link to the package; Chrome opens Google Play
 *   when the app is missing (`S.browser_fallback_url`).
 * - iOS: `smog://<path>` only. There is no timed store fallback: Safari's
 *   "Open in the app?" sheet keeps the page visible, so a timer would send
 *   people who have the app to the App Store (review I1). The page shows a
 *   separate App Store link instead (`storeUrl`).
 * Elsewhere (`null`) the universal link is simply followed.
 */
export function openInAppPlan(
  path: string,
  platform: MobilePlatform
): OpenInAppPlan | null {
  const rest = path.replace(LEADING_SLASHES, "");
  if (platform === "ios") {
    return { href: `${APP_SCHEME}://${rest}`, storeUrl: APP_STORE_URL };
  }
  if (platform === "android") {
    const fallback = encodeURIComponent(PLAY_STORE_URL);
    return {
      href: `intent://${rest}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
    };
  }
  return null;
}

export interface AppBannerGate {
  /** `useConsent()` is ready and no decision is pending. */
  consentDecided: boolean;
  /** `preferences.appBannerDismissedAt` is set on this device. */
  dismissed: boolean;
  /** `useMobilePlatform()`: `null` on the server, before hydration and on desktops. */
  platform: MobilePlatform | null;
  /** The device store has been read (its defaults would show it too early). */
  storeLoaded: boolean;
}

/**
 * The home page's app banner (inventory L-16): phones only, once the
 * consent decision is made (never stacked with the consent banner), until
 * it is dismissed on this device.
 */
export function shouldShowAppBanner(gate: AppBannerGate): boolean {
  return (
    gate.platform !== null &&
    gate.consentDecided &&
    gate.storeLoaded &&
    !gate.dismissed
  );
}

function currentTraits(): BrowserTraits {
  return {
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
    width: window.innerWidth,
  };
}

/**
 * The browser's platform once hydrated, or `null` on the server, on the
 * first render and on desktops, so the markup never differs at hydration.
 */
export function useMobilePlatform(): MobilePlatform | null {
  const [platform, setPlatform] = useState<MobilePlatform | null>(null);
  useEffect(() => {
    const traits = currentTraits();
    setPlatform(isMobileBrowser(traits) ? mobilePlatform(traits) : null);
  }, []);
  return platform;
}
