import { createI18n, DEFAULT_LOCALE, isLocale, type Locale } from "@smog/i18n";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { UiGallery } from "../../dev/ui-gallery";
import { getDevToolsEnabled } from "../../server/dev-tools.functions";

export interface DevUiSearch {
  lang?: Locale;
}

export const Route = createFileRoute("/dev/ui")({
  // dev and staging only; production answers 404 (spec §9).
  beforeLoad: async () => {
    if (!(await getDevToolsEnabled())) {
      throw notFound();
    }
  },
  component: DevUi,
  head: ({ match }) => ({
    meta: [
      {
        title: createI18n(match.search.lang ?? DEFAULT_LOCALE).t(
          "devTools.componentGallery"
        ),
      },
      { content: "noindex", name: "robots" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): DevUiSearch =>
    isLocale(search.lang) ? { lang: search.lang } : {},
});

function DevUi(): ReactNode {
  const { lang } = Route.useSearch();
  return <UiGallery locale={lang ?? DEFAULT_LOCALE} />;
}
