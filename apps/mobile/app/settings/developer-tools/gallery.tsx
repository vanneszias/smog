import type { ComponentType, ReactElement } from "react";

/**
 * Expo inlines `EXPO_PUBLIC_ENVIRONMENT` and Metro folds the condition in
 * release builds, so a production bundle drops the `require` and the gallery
 * module with it (`scripts/mobile-release-check.ts` greps for its marker).
 * The route itself stays: Expo Router bundles every route file.
 */
const Gallery: ComponentType | null =
  process.env.EXPO_PUBLIC_ENVIRONMENT === "production"
    ? null
    : (
        require("@/dev/component-gallery") as typeof import("@/dev/component-gallery")
      ).ComponentGallery;

/** Settings → Developer tools → Component gallery (spec §16). */
export default function GalleryScreen(): ReactElement | null {
  return Gallery ? <Gallery /> : null;
}
