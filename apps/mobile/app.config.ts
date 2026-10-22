import { tokens } from "@smog/styles/tokens";
import type { ConfigContext, ExpoConfig } from "expo/config";

/*
 * The app's build variants (phase 9 ruling 9). `APP_VARIANT` is set by the
 * `development` and `staging` EAS profiles (`eas.json`). A variant installs
 * next to the store app: its own name, bundle identifier, Android package and
 * URL scheme, and no universal links. `production` and an unset variable are
 * the store app, unchanged.
 *
 * It lives in this file because Expo's config loader resolves no relative
 * imports of local TypeScript (only packages): the tests, `mobile-release-check`
 * and the app (through the resolved config) read it from here.
 */

type AppVariant = "development" | "production" | "staging";

interface VariantIdentity {
  /** The iOS bundle identifier and the Android package. */
  applicationId: string;
  /**
   * Whether the build claims the site's universal links (the associated
   * domain, the verified https intent filter). Only the store app does: the
   * AASA and assetlinks files name its identifiers alone.
   */
  claimsSiteLinks: boolean;
  /** The name under the icon. */
  name: string;
  /** The app's deep-link scheme (no `://`). */
  scheme: string;
}

const PRODUCTION_ID = "be.zias.smog";

const IDENTITIES: Record<AppVariant, VariantIdentity> = {
  development: {
    applicationId: `${PRODUCTION_ID}.dev`,
    claimsSiteLinks: false,
    name: "SMOG Dev",
    scheme: "smog-dev",
  },
  production: {
    applicationId: PRODUCTION_ID,
    claimsSiteLinks: true,
    name: "SMOG & Co",
    scheme: "smog",
  },
  staging: {
    applicationId: `${PRODUCTION_ID}.staging`,
    claimsSiteLinks: false,
    name: "SMOG Staging",
    scheme: "smog-staging",
  },
};

/**
 * The variant `APP_VARIANT` names. Unset or empty is the store app; any other
 * unknown value throws, so a typo cannot ship under the store identity.
 */
export function parseAppVariant(raw: string | undefined): AppVariant {
  const value = raw?.trim() ?? "";
  if (value === "") {
    return "production";
  }
  if (
    value === "development" ||
    value === "staging" ||
    value === "production"
  ) {
    return value;
  }
  throw new Error(
    `[app.config] APP_VARIANT must be development, staging or production, got "${value}"`
  );
}

export function variantIdentity(variant: AppVariant): VariantIdentity {
  return IDENTITIES[variant];
}

const FIGTREE_FILES = Object.values(tokens.fontFamily.native).map(
  (family) => `./assets/fonts/${family}.ttf`
);

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
  // `development` and `staging` install next to the store app (phase 9
  // ruling 9): their own name, ids and scheme, and no universal links.
  const identity = variantIdentity(parseAppVariant(process.env.APP_VARIANT));

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
          data: [{ scheme: identity.scheme }],
        },
        ...(identity.claimsSiteLinks
          ? [
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
                  ...APP_LINK_PATHS.map((path) => ({
                    host,
                    path,
                    scheme: "https",
                  })),
                ],
              },
            ]
          : []),
      ],
      // No versionCode / ios.buildNumber: EAS keeps them remotely
      // (`appVersionSource: "remote"`, phase 8 ruling 3).
      package: identity.applicationId,
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
      ...(identity.claimsSiteLinks
        ? { associatedDomains: [`applinks:${host}`] }
        : {}),
      bundleIdentifier: identity.applicationId,
      icon: "./assets/smog.icon",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      supportsTablet: true,
      usesAppleSignIn: true,
    },
    name: identity.name,
    orientation: "portrait",
    owner: "smog-and-co",
    plugins: [
      "expo-router",
      "expo-localization",
      // Figtree, embedded at build time: no flash of the system font, and
      // the file names are the family names `tokens.fontFamily.native` uses.
      ["expo-font", { fonts: FIGTREE_FILES }],
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
    scheme: identity.scheme,
    slug: "smog",
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    userInterfaceStyle: "automatic",
    version: "3.0.0",
  };
}
