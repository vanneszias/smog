import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { SiteDocument } from "@/components/SiteDocument";
import { isLocale, LOCALES, type Locale } from "@/lib/locale";

export const metadata: Metadata = {
  description:
    "Gebaren opzoeken, bekijken en bewaren — de openbare SMOG-website.",
  title: { default: "SMOG", template: "%s — SMOG" },
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
              </ul>
            </nav>
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
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          {children}
        </main>
      </div>
    </SiteDocument>
  );
}
