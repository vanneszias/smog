import { createI18n } from "@smog/i18n";
import { tokens } from "@smog/styles/tokens";

/** The web app manifest's icon members (files `@smog/brand` generates). */
interface ManifestIcon {
  purpose?: "any" | "maskable";
  sizes: string;
  src: string;
  type: string;
}

/** A long-press shortcut on the installed app's icon. */
interface ManifestShortcut {
  name: string;
  url: string;
}

export interface WebManifest {
  background_color: string;
  categories: string[];
  description: string;
  display: "standalone";
  icons: ManifestIcon[];
  id: "/";
  lang: "nl";
  name: string;
  orientation: "any";
  scope: "/";
  short_name: string;
  shortcuts: ManifestShortcut[];
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
 * no locale to follow (the shipped Dutch texts, no overlay).
 *
 * The colours follow the header green (`tokens.chrome`, DECISIONS "Brand
 * identity: the browser bar follows the header"): the title bar of the
 * installed app and its splash are one green field with the white icon.
 * The name is the product's, "SMOG & Co", as everywhere else.
 */
export function webManifest(): WebManifest {
  const { t } = createI18n("nl");
  return {
    background_color: tokens.chrome.manifestBackground.toLowerCase(),
    categories: ["education", "reference"],
    description: `${t("home.tagline")}. SMOG staat voor Spreken Met Ondersteuning van Gebaren.`,
    display: "standalone",
    icons: MANIFEST_ICONS.map((icon) => ({ ...icon })),
    id: "/",
    lang: "nl",
    name: t("common.appName"),
    orientation: "any",
    scope: "/",
    short_name: t("common.appName"),
    shortcuts: [
      { name: t("meta.shortcuts.gestures"), url: "/gestures" },
      { name: t("meta.shortcuts.mySpace"), url: "/my" },
    ],
    start_url: "/",
    theme_color: tokens.chrome.manifestTheme.toLowerCase(),
  };
}
