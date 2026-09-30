import {
  categoriesOptions,
  FEATURED_LIMIT,
  gesturesPageOptions,
  useCategories,
  useFeaturedGestures,
} from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, ErrorState, Heading, Text } from "@smog/ui-web";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { SiteAppBanner } from "@/components/app-banner";
import {
  GestureGridSkeleton,
  LinkedGestureGrid,
} from "@/components/learning/gesture-cards";
import { Page } from "@/components/learning/page";
import { SearchBox } from "@/components/learning/search-box";
import { useHearts } from "@/components/learning/use-hearts";
import { seoHead, shellHead } from "@/lib/head";

export const Route = createFileRoute("/")({
  component: Home,
  head: ({ matches }) => {
    const { siteUrl, t } = shellHead(matches);
    const description = t("home.description");
    return seoHead(matches, {
      description,
      // The site search, for search engines (inventory P-13).
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "WebSite",
        description,
        inLanguage: ["nl", "en", "fr"],
        name: t("common.appName"),
        potentialAction: {
          "@type": "SearchAction",
          "query-input": "required name=search_term_string",
          target: `${siteUrl}/gestures?q={search_term_string}`,
        },
        url: `${siteUrl}/`,
      },
      path: "/",
    });
  },
  loader: async ({ context }) => {
    const { queryClient, queryUtils } = context;
    await Promise.all([
      queryClient.prefetchQuery(categoriesOptions(queryUtils.gestures)),
      queryClient.prefetchQuery(
        gesturesPageOptions(queryUtils.gestures, FEATURED_LIMIT)
      ),
    ]);
  },
});

function Featured(): ReactNode {
  const { t } = useTranslation();
  const featured = useFeaturedGestures(FEATURED_LIMIT);
  const hearts = useHearts();
  const { refetch } = featured;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  let body: ReactNode;
  if (featured.data) {
    body = (
      <LinkedGestureGrid
        // Eight featured gestures: two full rows of four on desktop.
        className="xl:grid-cols-4"
        hearts={hearts}
        items={featured.data}
        level={3}
      />
    );
  } else if (featured.isError) {
    body = <ErrorState onRetry={retry} retrying={featured.isRefetching} />;
  } else {
    body = <GestureGridSkeleton count={FEATURED_LIMIT} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2}>{t("home.featured")}</Heading>
        <Button asChild variant="ghost">
          <Link to="/gestures">
            {t("home.browseAll")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
      {body}
    </section>
  );
}

function Categories(): ReactNode {
  const { t } = useTranslation();
  const categories = useCategories();
  if (!categories.data || categories.data.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("search.categories")} className="flex flex-col gap-3">
      <Heading level={2} size="title-3">
        {t("search.categories")}
      </Heading>
      <ul className="flex flex-wrap gap-2">
        {categories.data.map((category) => (
          <li key={category.slug}>
            <Button asChild size="sm" variant="secondary">
              <Link search={{ category: category.slug }} to="/gestures">
                {category.name}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Home (spec §9): the hero with search, the categories, featured gestures. */
function Home(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [text, setText] = useState("");

  const submit = useCallback(
    (query: string): void => {
      navigate({
        search: query ? { q: query } : {},
        to: "/gestures",
      }).catch((error: unknown) => {
        console.error("[home] Failed to open the search:", error);
      });
    },
    [navigate]
  );

  return (
    <Page className="gap-10 md:gap-12">
      <SiteAppBanner />
      <section className="flex flex-col items-center gap-6 pt-6 text-center md:pt-12">
        <div className="flex max-w-reading flex-col gap-3">
          <Heading level={1} size="display">
            {t("home.title")}
          </Heading>
          <Text tone="muted">{t("home.tagline")}</Text>
        </div>
        <div className="w-full max-w-reading text-left">
          <SearchBox
            action="/gestures"
            label={t("home.searchLabel")}
            onSubmit={submit}
            onValueChange={setText}
            placeholder={t("home.searchPlaceholder")}
            value={text}
          />
        </div>
      </section>
      <Categories />
      <Featured />
    </Page>
  );
}
