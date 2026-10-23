import {
  createI18n,
  ensureCatalogues,
  isLocale,
  type Locale,
} from "@smog/i18n";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense } from "react";
import { pageMeta } from "@/lib/head";
import { getDevUiEnabled } from "@/server/dev-tools.functions";

/**
 * `__SMOG_DEV_TOOLS__` is `false` in production builds (vite.config.ts), so
 * this import is dropped and the gallery and kit are not in the production
 * Worker at all; the deploy guard checks it. The runtime ENVIRONMENT check in
 * `beforeLoad` stays as defence in depth.
 */
const UiGallery = __SMOG_DEV_TOOLS__
  ? lazy(async () => {
      // A `?lang=` page is server-rendered in that language while the browser
      // holds only the shell's one: load it before this chunk hydrates
      // (the lazy boundary suspends hydration until then).
      if (typeof window !== "undefined") {
        const lang = new URLSearchParams(window.location.search).get("lang");
        if (isLocale(lang)) {
          await ensureCatalogues(lang);
        }
      }
      const module = await import("../../dev/ui-gallery");
      return { default: module.UiGallery };
    })
  : null;

export interface DevUiSearch {
  lang?: Locale;
}

export const Route = createFileRoute("/dev/ui")({
  // dev and staging only; production answers 404 (spec §9).
  beforeLoad: async ({ search }) => {
    if (!(UiGallery && (await getDevUiEnabled()))) {
      throw notFound();
    }
    if (search.lang) {
      await ensureCatalogues(search.lang);
    }
  },
  component: DevUi,
  head: ({ match, matches }) =>
    match.search.lang
      ? {
          meta: [
            {
              title: createI18n(match.search.lang).t(
                "devTools.componentGallery"
              ),
            },
            { content: "noindex", name: "robots" },
          ],
        }
      : pageMeta(matches, "devTools.componentGallery"),
  validateSearch: (search: Record<string, unknown>): DevUiSearch =>
    isLocale(search.lang) ? { lang: search.lang } : {},
});

function DevUi(): ReactNode {
  const { lang } = Route.useSearch();
  if (!UiGallery) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <UiGallery lang={lang} />
    </Suspense>
  );
}
