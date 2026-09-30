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
/** How long the iOS scheme gets to open the app before the store fallback. */
const OPEN_IN_APP_FALLBACK_MS = 500;

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
  /** Where the app store is, if the app did not take over in time (iOS). */
  fallback?: string;
  /** The link that opens the app. */
  href: string;
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
 * - iOS: `smog://<path>`, then the App Store if the page is still visible
 *   after `OPEN_IN_APP_FALLBACK_MS`.
 * Elsewhere (`null`) the universal link is simply followed.
 */
export function openInAppPlan(
  path: string,
  platform: MobilePlatform
): OpenInAppPlan | null {
  const rest = path.replace(LEADING_SLASHES, "");
  if (platform === "ios") {
    return { fallback: APP_STORE_URL, href: `${APP_SCHEME}://${rest}` };
  }
  if (platform === "android") {
    const fallback = encodeURIComponent(PLAY_STORE_URL);
    return {
      href: `intent://${rest}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`,
    };
  }
  return null;
}

/** Follows a plan in this browser tab (the store if the app did not open). */
export function followOpenInAppPlan(plan: OpenInAppPlan): void {
  window.location.href = plan.href;
  const { fallback } = plan;
  if (!fallback) {
    return;
  }
  window.setTimeout(() => {
    // The app took over: the page went to the background.
    if (document.visibilityState === "visible") {
      window.location.href = fallback;
    }
  }, OPEN_IN_APP_FALLBACK_MS);
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
