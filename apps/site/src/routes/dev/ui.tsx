import { createI18n, isLocale, type Locale } from "@smog/i18n";
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
  ? lazy(() =>
      import("../../dev/ui-gallery").then((module) => ({
        default: module.UiGallery,
      }))
    )
  : null;

export interface DevUiSearch {
  lang?: Locale;
}

export const Route = createFileRoute("/dev/ui")({
  // dev and staging only; production answers 404 (spec §9).
  beforeLoad: async () => {
    if (!(UiGallery && (await getDevUiEnabled()))) {
      throw notFound();
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
