import { CONTACT_EMAIL, SMOG_WEBSITE_URL } from "@smog/config/constants";
import {
  type CatalogueOverlay,
  createI18n,
  DEFAULT_LOCALE,
  intlTag,
  LOCALES,
  type Locale,
  type Translate,
  type TranslationKey,
} from "@smog/i18n";
import { siteOrigin } from "./site-url";

interface MatchWithData {
  loaderData?: unknown;
}

interface ShellHead {
  locale: Locale;
  /** `SITE_URL` without a trailing slash. */
  siteUrl: string;
  t: Translate;
}

/** The root match's loader data is the shell: its locale and site URL. */
export function shellHead(matches: readonly MatchWithData[]): ShellHead {
  const data = matches[0]?.loaderData;
  const shell = typeof data === "object" && data !== null ? data : {};
  // The loader already resolved the locale against the enabled languages.
  const locale =
    "locale" in shell && typeof shell.locale === "string"
      ? shell.locale
      : DEFAULT_LOCALE;
  const overlay =
    "overlay" in shell && typeof shell.overlay === "object" && shell.overlay
      ? (shell.overlay as CatalogueOverlay)
      : undefined;
  const siteUrl =
    "siteUrl" in shell && typeof shell.siteUrl === "string"
      ? siteOrigin(shell.siteUrl)
      : "";
  return { locale, siteUrl, t: createI18n(locale, overlay).t };
}

/**
 * `<title>` (and `noindex` for private pages) in the page's language. The
 * root match's loader data is the shell, which carries the locale.
 */
export function pageMeta(
  matches: readonly MatchWithData[],
  key: TranslationKey,
  { index = false }: { index?: boolean } = {}
) {
  const { t } = shellHead(matches);
  return {
    meta: [
      { title: `${t(key)} · ${t("common.appName")}` },
      ...(index ? [] : [{ content: "noindex", name: "robots" }]),
    ],
  };
}

/** A share image (`og:image`) with the size and text the cards need. */
export interface ShareImage {
  alt: string;
  height: number;
  type: "image/jpeg" | "image/png";
  /** Absolute URL. */
  url: string;
  width: number;
}

/** The share card's size: 1.91:1, what every network shows uncropped. */
export const SHARE_CARD = { height: 630, width: 1200 } as const;

/**
 * The brand share card in the page's language (`/og-<locale>.png`, made by
 * `apps/site/scripts/share-cards.ts` from the shipped tagline): deep green,
 * the logo, the tagline. A language added in the admin has no card of its
 * own and gets the default language's.
 */
export function shareCard(
  siteUrl: string,
  locale: Locale,
  t: Translate
): ShareImage {
  const card = (LOCALES as readonly string[]).includes(locale)
    ? locale
    : DEFAULT_LOCALE;
  return {
    alt: t("meta.shareImageAlt"),
    type: "image/png",
    url: `${siteUrl}/og-${card}.png`,
    ...SHARE_CARD,
  };
}

export interface SeoOptions {
  description: string;
  /** The share image; the brand card in the page's language by default. */
  image?: ShareImage;
  /** Structured data (`application/ld+json`). */
  jsonLd?: Record<string, unknown>;
  /** `og:title` when it differs from `<title>` (the home page's tagline). */
  ogTitle?: string;
  /** The canonical path, e.g. `/gestures/hond`. */
  path: string;
  /** The page's own title; the app name is appended (only the app name without one). */
  title?: string;
  /** `og:type`. */
  type?: "video.other" | "website";
}

/**
 * JSON for a `<script>` element: `<` is escaped so no value can close the
 * element (`</script>`) or open a comment.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** `og:locale` (`nl_BE`) from the language's `Intl` tag (`nl-BE`). */
function ogLocale(locale: Locale): string {
  return intlTag(locale).replaceAll("-", "_");
}

/**
 * The `@id`s of the site's identity graph: the organisation and the website
 * are described once, on the home page, and every other block points at
 * them.
 */
export function graphIds(siteUrl: string): { org: string; site: string } {
  return { org: `${siteUrl}/#org`, site: `${siteUrl}/#site` };
}

/**
 * The organisation (`schema.org/Organization`), from facts the site already
 * shows: the name, the logo, the main website and the contact address.
 * The legal name, address and company number stay out until the owner
 * confirms them (docs/DECISIONS.md, "Brand identity: metadata").
 */
export function organizationLd(
  siteUrl: string,
  t: Translate
): Record<string, unknown> {
  return {
    "@id": graphIds(siteUrl).org,
    "@type": "Organization",
    email: CONTACT_EMAIL,
    logo: `${siteUrl}/icon-512.png`,
    name: t("common.appName"),
    // The organisation's own website; this site is its `WebSite`.
    url: SMOG_WEBSITE_URL,
  };
}

/** Title, description, canonical, Open Graph and JSON-LD for a public page. */
export function seoHead(
  matches: readonly MatchWithData[],
  {
    description,
    image,
    jsonLd,
    ogTitle,
    path,
    title,
    type = "website",
  }: SeoOptions
) {
  const { locale, siteUrl, t } = shellHead(matches);
  const appName = t("common.appName");
  const fullTitle = title ? `${title} · ${appName}` : appName;
  const url = `${siteUrl}${path}`;
  const share = image ?? shareCard(siteUrl, locale, t);
  return {
    links: [{ href: url, rel: "canonical" }],
    meta: [
      { title: fullTitle },
      { content: description, name: "description" },
      { content: ogTitle ?? fullTitle, property: "og:title" },
      { content: description, property: "og:description" },
      { content: url, property: "og:url" },
      { content: share.url, property: "og:image" },
      { content: share.type, property: "og:image:type" },
      { content: String(share.width), property: "og:image:width" },
      { content: String(share.height), property: "og:image:height" },
      { content: share.alt, property: "og:image:alt" },
      { content: type, property: "og:type" },
      { content: appName, property: "og:site_name" },
      // The site is Belgian: nl_BE, en_BE, fr_BE (a language added in the
      // admin has the form its `Intl` tag gives, `de_BE`).
      { content: ogLocale(locale), property: "og:locale" },
      { content: "summary_large_image", name: "twitter:card" },
      { content: share.alt, name: "twitter:image:alt" },
    ],
    scripts: jsonLd
      ? [{ children: scriptJson(jsonLd), type: "application/ld+json" }]
      : [],
  };
}
