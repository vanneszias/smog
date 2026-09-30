import {
  createI18n,
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  type TranslationKey,
} from "@smog/i18n";
import { siteOrigin } from "./site-url";

interface MatchWithData {
  loaderData?: unknown;
}

type Translate = ReturnType<typeof createI18n>["t"];

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
  const locale =
    "locale" in shell && isLocale(shell.locale) ? shell.locale : DEFAULT_LOCALE;
  const siteUrl =
    "siteUrl" in shell && typeof shell.siteUrl === "string"
      ? siteOrigin(shell.siteUrl)
      : "";
  return { locale, siteUrl, t: createI18n(locale).t };
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

export interface SeoOptions {
  description: string;
  /** Absolute image URL (`og:image`); the brand image by default. */
  image?: string;
  /** Structured data (`application/ld+json`). */
  jsonLd?: Record<string, unknown>;
  /** The canonical path, e.g. `/gestures/hond`. */
  path: string;
  /** The page's own title; the app name is appended (none on the home page). */
  title?: string;
  /** `og:type`. */
  type?: "video.other" | "website";
}

/**
 * JSON for a `<script>` element: `<` is escaped so no value can close the
 * element (`</script>`) or open a comment.
 */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

/** Title, description, canonical, Open Graph and JSON-LD for a public page. */
export function seoHead(
  matches: readonly MatchWithData[],
  { description, image, jsonLd, path, title, type = "website" }: SeoOptions
) {
  const { locale, siteUrl, t } = shellHead(matches);
  const appName = t("common.appName");
  const fullTitle = title ? `${title} · ${appName}` : appName;
  const url = `${siteUrl}${path}`;
  const ogImage = image ?? `${siteUrl}/og.png`;
  return {
    links: [{ href: url, rel: "canonical" }],
    meta: [
      { title: fullTitle },
      { content: description, name: "description" },
      { content: fullTitle, property: "og:title" },
      { content: description, property: "og:description" },
      { content: url, property: "og:url" },
      { content: ogImage, property: "og:image" },
      { content: type, property: "og:type" },
      { content: appName, property: "og:site_name" },
      // The site is Belgian: nl_BE, en_BE, fr_BE.
      { content: `${locale}_BE`, property: "og:locale" },
      { content: "summary_large_image", name: "twitter:card" },
    ],
    scripts: jsonLd
      ? [{ children: scriptJson(jsonLd), type: "application/ld+json" }]
      : [],
  };
}
