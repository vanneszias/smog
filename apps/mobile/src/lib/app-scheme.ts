import Constants from "expo-constants";

/** The store app's scheme (`app.config.ts`, an unset `APP_VARIANT`). */
const STORE_SCHEME = "smog";

/**
 * The deep-link scheme this build was configured with: `smog` for the store
 * app, `smog-staging` / `smog-dev` for the variants (phase 9 ruling 9). It is
 * read from the resolved config, so the one place that derives it is
 * `app.config.ts`.
 */
export function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  const first = Array.isArray(scheme) ? scheme[0] : scheme;
  return typeof first === "string" && first !== "" ? first : STORE_SCHEME;
}
