import { tokens } from "@smog/styles/tokens";
import type { ConfigContext, ExpoConfig } from "expo/config";

const EAS_PROJECT_ID = "9fa68b63-dfa5-498a-9196-5eba93ecac29";
const BRAND_GREEN = tokens.color.brand.green;
/**
 * A build without `EXPO_PUBLIC_SITE_HOST` (a local `expo` run) links to
 * staging's host. `scripts/release-config-check.ts` keeps it equal to
 * staging's `SITE_URL` host; every EAS profile sets its own (`eas.json`).
 */
const DEFAULT_SITE_HOST = "smog-site-staging.zias.workers.dev";
/** Site paths the app opens itself instead of the browser. */
const APP_LINK_PATH_PREFIXES = ["/gestures/", "/lists/"] as const;
/** Exact site paths the app opens (the magic-link hand-off, phase 4 task 5). */
const APP_LINK_PATHS = ["/magic-link/app"] as const;

export default function createConfig({ config }: ConfigContext): ExpoConfig {
  const host = process.env.EXPO_PUBLIC_SITE_HOST || DEFAULT_SITE_HOST;

  return {
    ...config,
    android: {
      adaptiveIcon: {
        backgroundColor: BRAND_GREEN,
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      intentFilters: [
        {
          action: "VIEW",
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: "smog" }],
        },
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            ...APP_LINK_PATH_PREFIXES.map((pathPrefix) => ({
              host,
              pathPrefix,
              scheme: "https",
            })),
            ...APP_LINK_PATHS.map((path) => ({ host, path, scheme: "https" })),
          ],
        },
      ],
      // No versionCode / ios.buildNumber: EAS keeps them remotely
      // (`appVersionSource: "remote"`, phase 8 ruling 3).
      package: "be.zias.smog",
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: { projectId: EAS_PROJECT_ID },
    },
    icon: "./assets/icon.png",
    ios: {
      appleTeamId: "96XKP6MU2A",
      associatedDomains: [`applinks:${host}`],
      bundleIdentifier: "be.zias.smog",
      icon: "./assets/smog.icon",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      supportsTablet: true,
      usesAppleSignIn: true,
    },
    name: "SMOG & Co",
    orientation: "portrait",
    owner: "smog-and-co",
    plugins: [
      "expo-router",
      "expo-localization",
      "expo-font",
      "expo-secure-store",
      "expo-apple-authentication",
      "expo-video",
      "expo-web-browser",
      [
        "expo-splash-screen",
        {
          backgroundColor: BRAND_GREEN,
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
        },
      ],
      "./plugins/with-screen-capture-permissions.js",
    ],
    runtimeVersion: { policy: "fingerprint" },
    scheme: "smog",
    slug: "smog",
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    userInterfaceStyle: "automatic",
    version: "3.0.0",
  };
}
