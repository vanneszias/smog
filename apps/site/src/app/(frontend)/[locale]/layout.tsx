import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AccountNav } from "@/components/AccountNav";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SiteDocument } from "@/components/SiteDocument";
import { isLocale, LOCALES, type Locale } from "@/lib/locale";
import { readSession } from "@/lib/session";

const SITE_NAME = "SMOG";

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
  nl: "Gebaren opzoeken, bekijken en bewaren — de openbare SMOG-website.",
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
 * accurate `og:title` — where setting them here would stamp "SMOG" on all of
 * them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = { default: SITE_NAME, template: `%s — ${SITE_NAME}` };

  if (!isLocale(locale)) {
    // The layout 404s below; this only has to avoid indexing a wrong locale
    // into the title of the not-found page.
    return { title };
  }

  return {
    description: DESCRIPTIONS[locale],
    openGraph: {
      alternateLocale: LOCALES.filter((other) => other !== locale).map(
        (other) => OG_LOCALES[other]
      ),
      locale: OG_LOCALES[locale],
      siteName: SITE_NAME,
      type: "website",
    },
    title,
  };
}

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
 * pages in this group that were still static, are not any more. That is a
 * real cost and it is measured in the Stage 4 Task 2 report rather than
 * discovered later. It is paid here, in the layout, because the account nav
 * belongs in the header of every page and a per-page session read would be
 * the same cost with three places to forget it. `hasSessionCookie` keeps the
 * common case — a signed-out visitor — from booting Payload at all.
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
            <a
              className="font-bold text-foreground text-lg"
              href={`/${locale}`}
            >
              SMOG
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
            <div className="flex items-center gap-4">
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
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    </SiteDocument>
  );
}
