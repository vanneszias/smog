/**
 * Developer tools (component gallery, logs) exist in dev and staging builds
 * only (spec §10). Expo inlines `EXPO_PUBLIC_ENVIRONMENT` at build time; a
 * build without it is a local one, which counts as dev.
 */
export function devToolsAvailable(): boolean {
  return process.env.EXPO_PUBLIC_ENVIRONMENT !== "production";
}
