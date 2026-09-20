"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { LOCALES, type Locale, localeHref } from "@/lib/locale";

/**
 * Each locale named in itself, which is what a visitor who cannot read the
 * current one is looking for. The labels match `localization.locales` in
 * `payload.config.ts`.
 */
const LOCALE_LABELS: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
  fr: "Français",
};

/**
 * Switches locale without losing the page.
 *
 * `"use client"` because `usePathname` and `useSearchParams` are the only way
 * a component can know where it is, and both are client hooks. It is the
 * smallest thing on the page that needs the directive — the layout around it
 * stays a Server Component.
 *
 * Plain `<a>` rather than `next/link` on purpose. A locale switch changes
 * `<html lang>`, every string on the page and the `Link` prefetch target of
 * everything below it; a document navigation is both the honest thing to do
 * and cheaper than prefetching two whole other locales of every page that
 * renders this header.
 *
 * `useSearchParams` opts a route out of static rendering unless it is inside
 * a Suspense boundary, so the layout wraps this component in one. Without it
 * `next build` fails on every prerendered page in the group, not just here.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const here = query === "" ? pathname : `${pathname}?${query}`;

  return (
    <nav aria-label="Taal">
      <ul className="flex items-center gap-2">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <a
              aria-current={locale === current ? "true" : undefined}
              className={
                locale === current
                  ? "font-semibold text-foreground text-sm underline underline-offset-4"
                  : "text-foreground-muted text-sm hover:text-foreground"
              }
              data-testid={`locale-switch-${locale}`}
              href={localeHref(here, locale)}
              hrefLang={locale}
            >
              {LOCALE_LABELS[locale]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
