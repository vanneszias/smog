import { tokens } from "@smog/styles/tokens";

/** The web app manifest's icon members (files `@smog/brand` generates). */
interface ManifestIcon {
  purpose?: "any" | "maskable";
  sizes: string;
  src: string;
  type: string;
}

export interface WebManifest {
  background_color: string;
  categories: string[];
  description: string;
  display: "standalone";
  icons: ManifestIcon[];
  lang: "nl";
  name: string;
  orientation: "any";
  scope: "/";
  short_name: string;
  start_url: "/";
  theme_color: string;
}

/**
 * The icons that exist in `public/` (inventory P-14: the old site's nine
 * `android-chrome-*` sizes became the generated set, DECISIONS phase 9 task
 * 9). The maskable one carries its own safe zone.
 */
export const MANIFEST_ICONS: readonly ManifestIcon[] = [
  { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
  { sizes: "512x512", src: "/icon-512.png", type: "image/png" },
  {
    purpose: "maskable",
    sizes: "512x512",
    src: "/icon-maskable-512.png",
    type: "image/png",
  },
  { sizes: "any", src: "/icon.svg", type: "image/svg+xml" },
];

/**
 * `/manifest.webmanifest` (inventory P-14, R-18): the app's identity and purpose.
 * Dutch, like the old one: a manifest is fetched without cookies, so it has
 * no locale to follow.
 */
export function webManifest(): WebManifest {
  return {
    background_color: "#ebf4eb",
    categories: ["education", "reference"],
    description:
      "Mensen gaan van nature hun spraak ondersteunen met gebaren. SMOG staat voor Spreken Met Ondersteuning van Gebaren.",
    display: "standalone",
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
    lang: "nl",
    name: "SMOG&Co",
    orientation: "any",
    scope: "/",
    short_name: "SMOG&Co",
    start_url: "/",
    theme_color: tokens.color.brand.green.toLowerCase(),
  };
}
