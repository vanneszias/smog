import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AccountNav } from "@/components/AccountNav";
import { BrandArt } from "@/components/BrandArt";
import { ConsentBanner } from "@/components/ConsentBanner";
import { ConsentSync } from "@/components/ConsentSync";
import { GuestFavoritesSync } from "@/components/GuestFavoritesSync";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SiteDocument } from "@/components/SiteDocument";
import {
  APPLE_TOUCH_ICON,
  BRAND_PRIMARY,
  DARK_BACKGROUND,
  FAVICONS,
  MANIFEST_PATH,
  SHARE_IMAGE,
  SITE_NAME,
} from "@/lib/brand";
import { isLocale, LOCALES, type Locale } from "@/lib/locale";
import { readSession } from "@/lib/session";
import { resolveSiteOrigin } from "@/lib/siteOrigin";

/**
 * The site's own description, per locale.
 *
 * The *content* falls back to Dutch in an untranslated locale — Payload's
 * `fallback: true` — but the chrome does not have to. A French visitor who
 * finds the site in a search result reads this line before anything else,
 * and a Dutch one there tells them the site is not for them.
 */
const DESCRIPTIONS: Record<Locale, string> = {
  en: "Look up, watch and save SMOG gestures.",
  fr: "Rechercher, regarder et enregistrer les gestes SMOG.",
  nl: "Gebaren opzoeken, bekijken en bewaren — de website van SMOG & Co.",
};

/**
 * Open Graph speaks Facebook's `language_TERRITORY`, not a bare ISO code.
 *
 * Belgian territories for Dutch and French, because that is who this is for;
 * `en_GB` for English, since the alternative would be claiming a US audience
 * for a Flemish sign system.
 */
const OG_LOCALES: Record<Locale, string> = {
  en: "en_GB",
  fr: "fr_BE",
  nl: "nl_BE",
};

/**
 * The metadata every public page inherits.
 *
 * Two omissions are deliberate, and both would be bugs if they were here.
 *
 * **No `alternates`.** `mergeMetadata` in
 * `next/dist/lib/metadata/resolve-metadata.js` (16.3.3) clones the parent's
 * resolved metadata and overwrites only the keys the child *defines*, so an
 * `alternates.canonical` set here would be inherited verbatim by every page
 * that does not set its own — `/nl/gestures` would declare `/nl` as its
 * canonical URL and ask Google to drop it from the index. Each page that
 * wants alternates therefore declares its own.
 *
 * **No `openGraph.title` or `openGraph.description`.** `postProcessMetadata`
 * (same file) fills both from the *page's* resolved title and description
 * when Open Graph leaves them unset, so omitting them gives every page an
 * accurate `og:title` — where setting them here would stamp "SMOG & Co" on
 * all of them.
 *
 * `openGraph.images` and `twitter` *are* here, because they are the same on
 * every page and Next inherits them into each child that sets no Open Graph
 * of its own — none does. A page that ever adds an `openGraph` must repeat the
 * image, since a child's `openGraph` replaces the parent's whole object.
 *
 * `metadataBase` turns every relative URL above into an absolute one, which
 * the share image requires; see `lib/siteOrigin.ts` for where it comes from.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const shared: Metadata = {
    icons: { apple: [APPLE_TOUCH_ICON], icon: FAVICONS },
    manifest: MANIFEST_PATH,
    metadataBase: resolveSiteOrigin(process.env.SITE_ORIGIN, await headers()),
    title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  };

  if (!isLocale(locale)) {
    // The layout 404s below; this only has to avoid indexing a wrong locale
    // into the title of the not-found page.
    return shared;
  }

  return {
    ...shared,
    description: DESCRIPTIONS[locale],
    openGraph: {
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other]
      ),
      images: [SHARE_IMAGE],
      locale: OG_LOCALES[locale],
      siteName: SITE_NAME,
      type: "website",
    },
    twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
  };
}

/**
 * The browser chrome's colour: the brand green in light mode, the page
 * background in dark mode, so a dark page does not sit under a green bar.
 *
 * Keyed on `prefers-color-scheme`, which is the only condition a `<meta>` can
 * express. A stored theme choice that differs from the operating system's
 * (`lib/theme.ts`) still gets the operating system's bar colour: the theme
 * class is set by script, and no media query can see it.
 */
export const viewport: Viewport = {
  themeColor: [
    { color: BRAND_PRIMARY, media: "(prefers-color-scheme: light)" },
    { color: DARK_BACKGROUND, media: "(prefers-color-scheme: dark)" },
  ],
};

/**
 * The three locales, so all of them prerender.
 *
 * Next hands the returned objects back as the `params` of this segment, so
 * each one is keyed by the directory name — `[locale]` — and the value is the
 * URL segment as a string. Checked against `next@16.3.3`'s own generated
 * `.next/types/validator.ts`, which types this as
 * `(props: { params: ParamMap[Route] }) => Promise<any[]> | any[]`: the
 * return type is unchecked, so a wrong key here fails at build time and not
 * at type-check time.
 */
export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }));
}

/**
 * The shell every public page renders inside.
 *
 * `params` is a `Promise` in Next 16 — verified at the call site in
 * `.next/types/validator.ts`, which types a layout's props as
 * `{ params: Promise<ParamMap[Route]> }` — so it is awaited rather than
 * destructured.
 *
 * An unknown locale is a 404 and not a silent fallback: `/de/gestures` would
 * otherwise serve Dutch content under a URL that claims German, which is
 * worse than an error for a reader and worse than an error for a crawler.
 * `resolveLocale` still falls back to the default, because that is what every
 * helper downstream wants; the 404 is the route's job.
 *
 * **Reading the session here is what makes every page under it dynamic.**
 * `readSession` reads request headers, and a route that reads request headers
 * cannot be prerendered — so `/{locale}` and `/{locale}/favorites`, the two
 * pages in this group that were still static, are not any more. That is a real
 * cost, and a measured one rather than one discovered later. It is paid here,
 * in the layout, because the account nav belongs in the header of every page
 * and a per-page session read would be the same cost with three places to
 * forget it. `hasSessionCookie` keeps the common case — a signed-out visitor —
 * from booting Payload at all.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const user = await readSession();

  return (
    <SiteDocument lang={locale}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="border-border border-b bg-surface">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4">
            {/*
             * The logo is a mask over `/brand/logo.svg` painted `bg-primary`
             * rather than an inline SVG: the file is 18 KB of path data, which
             * inlined would ride along in every page's HTML and RSC payload,
             * whereas a static file is fetched once and cached. The mask keeps
             * it on the theme's primary colour in both themes, which an
             * `<img>` could not do. The link is named by the screen-reader
             * text beside the mask, so its name is "SMOG & Co" and not an
             * image's alt.
             */}
            <a
              className="flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href={`/${locale}`}
            >
              <BrandArt
                className="aspect-[2667/579] h-8 md:h-10"
                src="/brand/logo.svg"
              />
              <span className="sr-only">{SITE_NAME}</span>
            </a>
            <nav aria-label="Hoofdnavigatie">
              <ul className="flex items-center gap-4">
                <li>
                  <a
                    className="text-foreground-muted text-sm hover:text-foreground"
                    href={`/${locale}/gestures`}
                  >
                    Gebaren
                  </a>
                </li>
                <li>
                  <a
                    className="text-foreground-muted text-sm hover:text-foreground"
                    href={`/${locale}/favorites`}
                  >
                    Favorieten
                  </a>
                </li>
              </ul>
            </nav>
            {/*
             * Wraps, so the account links and the three locales can sit on
             * two rows rather than push a 320px screen sideways.
             */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <AccountNav locale={locale} user={user} />
              {/*
               * `LocaleSwitcher` reads `useSearchParams`, which opts its route
               * out of static rendering unless it sits inside a Suspense
               * boundary. Without this wrapper every prerendered page in the
               * group fails the build, not only the ones with a query string.
               */}
              <Suspense fallback={null}>
                <LocaleSwitcher current={locale} />
              </Suspense>
            </div>
          </div>
        </header>
        {/*
         * Renders nothing. It carries a guest's favorites into the account on
         * the first signed-in page — which has to be here, in the layout,
         * because sign-in redirects to the home page and the only other
         * component that merges renders on gesture pages. See
         * `components/GuestFavoritesSync.tsx`.
         */}
        {user === null ? null : <GuestFavoritesSync />}
        {/*
         * Outside the session guard, unlike `GuestFavoritesSync`, and for a
         * reason the guard itself used to hide: a guest has nothing to
         * *post*, but a browser that was signed in a moment ago still holds
         * the decision that account made — and mounted only for a session,
         * this component never sees the sign-out that leaves it there. The
         * next person on a shared machine would then be tracked on somebody
         * else's "granted", with no banner and no decision of their own. It
         * takes `null` for a guest and clears exactly that case; see
         * `components/ConsentSync.tsx`.
         */}
        <ConsentSync userId={user === null ? null : user.id} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
        {/*
         * Last in the flex column on purpose, not beside `GuestFavoritesSync`
         * above. `ConsentBanner` renders its own reserved-space spacer
         * alongside the fixed banner (see its own doc comment), and that
         * spacer is a normal flow element: placed here, after `<main>`, it
         * extends the document *past* whatever the page's own last control
         * is, so a visitor can scroll clear of the banner to reach it. Placed
         * before `<main>` instead, it would only push the real content down
         * by the same amount and leave the page's true bottom exactly as
         * covered as before — the bug this placement exists to close.
         */}
        <ConsentBanner locale={locale} />
      </div>
    </SiteDocument>
  );
}
