import { describe, expect, it } from "vitest";
import {
  type BrowserTraits,
  isMobileBrowser,
  mobilePlatform,
  openInAppPlan,
  shouldShowAppBanner,
} from "../src/lib/open-in-app";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function traits(overrides: Partial<BrowserTraits>): BrowserTraits {
  return { maxTouchPoints: 0, userAgent: WINDOWS, width: 1280, ...overrides };
}

describe("isMobileBrowser (the old isMobileDevice, inventory L-15)", () => {
  it("matches phones by user agent", () => {
    expect(isMobileBrowser(traits({ userAgent: IPHONE, width: 1400 }))).toBe(
      true
    );
    expect(isMobileBrowser(traits({ userAgent: ANDROID }))).toBe(true);
  });

  it("counts a small touch screen (an iPad that says Macintosh)", () => {
    expect(
      isMobileBrowser(traits({ maxTouchPoints: 5, userAgent: MAC, width: 820 }))
    ).toBe(true);
  });

  it("leaves desktops alone, touch laptops with a wide screen too", () => {
    expect(isMobileBrowser(traits({}))).toBe(false);
    expect(isMobileBrowser(traits({ width: 390 }))).toBe(false);
    expect(isMobileBrowser(traits({ maxTouchPoints: 10, width: 1440 }))).toBe(
      false
    );
  });
});

describe("mobilePlatform", () => {
  it("tells iOS (iPadOS included) from Android", () => {
    expect(mobilePlatform(traits({ userAgent: IPHONE }))).toBe("ios");
    expect(mobilePlatform(traits({ maxTouchPoints: 5, userAgent: MAC }))).toBe(
      "ios"
    );
    expect(mobilePlatform(traits({ userAgent: ANDROID }))).toBe("android");
    expect(mobilePlatform(traits({ userAgent: MAC }))).toBe("other");
  });
});

describe("openInAppPlan", () => {
  it("iOS: the smog:// link only, with a separate App Store link (review I1)", () => {
    // No timed fallback: Safari's "Open in the app?" sheet keeps the page
    // visible, so a timer would send users who have the app to the store.
    expect(openInAppPlan("/gestures/goede-morgen", "ios")).toEqual({
      href: "smog://gestures/goede-morgen",
      storeUrl: "https://apps.apple.com/app/smog-co/id6758547774",
    });
  });

  it("Android: an intent link to the app, Google Play when it is missing", () => {
    expect(openInAppPlan("/gestures/goede-morgen", "android")).toEqual({
      href: "intent://gestures/goede-morgen#Intent;scheme=smog;package=be.zias.smog;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dbe.zias.smog;end",
    });
  });

  it("elsewhere: nothing (the universal link itself is followed)", () => {
    expect(openInAppPlan("/gestures/goede-morgen", "other")).toBeNull();
  });

  it("takes the path as the site links it (already encoded)", () => {
    expect(openInAppPlan("/gestures/a%20b", "ios")?.href).toBe(
      "smog://gestures/a%20b"
    );
  });
});

describe("shouldShowAppBanner (inventory L-16)", () => {
  const shown = {
    consentDecided: true,
    dismissed: false,
    platform: "ios",
    storeLoaded: true,
  } as const;

  it("shows on a phone once the consent is decided and the store is read", () => {
    expect(shouldShowAppBanner(shown)).toBe(true);
    expect(shouldShowAppBanner({ ...shown, platform: "android" })).toBe(true);
  });

  it("waits for the consent decision, so the two prompts never stack", () => {
    expect(shouldShowAppBanner({ ...shown, consentDecided: false })).toBe(
      false
    );
  });

  it("stays hidden before hydration, on desktops and once dismissed", () => {
    expect(shouldShowAppBanner({ ...shown, platform: null })).toBe(false);
    expect(shouldShowAppBanner({ ...shown, storeLoaded: false })).toBe(false);
    expect(shouldShowAppBanner({ ...shown, dismissed: true })).toBe(false);
  });
});
