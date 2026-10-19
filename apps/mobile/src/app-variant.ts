/**
 * The app's build variants (phase 9 ruling 9). `APP_VARIANT` is set by the
 * `development` and `staging` EAS profiles (`eas.json`) and read by
 * `app.config.ts` (it runs in Node, so this file imports nothing native).
 * A variant installs next to the store app: its own name, bundle identifier,
 * Android package and URL scheme. `production` and an unset variable are the
 * store app, unchanged.
 */

export type AppVariant = "development" | "production" | "staging";

export interface VariantIdentity {
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
