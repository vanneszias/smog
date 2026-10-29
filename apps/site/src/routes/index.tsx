import {
  categoriesOptions,
  FEATURED_LIMIT,
  gesturesPageOptions,
  useCategories,
  useFeaturedGestures,
} from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  ErrorState,
  HandIllustration,
  Heading,
  Text,
} from "@smog/ui-web";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { SiteAppBanner } from "@/components/app-banner";
import { CategoryTiles } from "@/components/learning/category-tiles";
import {
  GestureGridSkeleton,
  LinkedGestureGrid,
} from "@/components/learning/gesture-cards";
import { Page } from "@/components/learning/page";
import { RecentGestures } from "@/components/learning/recent-gestures";
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
        <Heading level={2} size="title-2">
          {t("home.featured")}
        </Heading>
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
  const categories = useCategories();
  return <CategoryTiles categories={categories.data ?? []} />;
}

/**
 * Home (spec §9, phase 10a): the green hero (the title, the big search and
 * a brand hand), the illustrated categories, "continue where you left off"
 * (this device's recent gestures), the featured gestures and the one banner
 * slot. The parts that mount after hydration (recents, the app banner) sit
 * under what is visible first, so the hero stays put.
 */
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
    <>
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="mx-auto grid w-full max-w-content items-center gap-8 px-4 py-10 md:px-6 md:py-16 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:px-8">
          <div className="flex flex-col gap-6">
            <div className="flex max-w-reading flex-col gap-3">
              <Heading
                className="text-primary-foreground"
                level={1}
                size="display"
              >
                {t("home.title")}
              </Heading>
              <Text className="text-primary-foreground">
                {t("home.tagline")}
              </Text>
              <Text className="text-primary-foreground">{t("home.intro")}</Text>
            </div>
            <div className="w-full max-w-reading">
              <SearchBox
                action="/gestures"
                label={t("home.searchLabel")}
                onSubmit={submit}
                onValueChange={setText}
                placeholder={t("home.searchPlaceholder")}
                value={text}
              />
            </div>
          </div>
          <HandIllustration
            className="hidden h-64 justify-self-end text-primary-foreground/25 lg:inline-flex"
            hand={1}
          />
        </div>
      </section>
      <Page className="gap-10 md:gap-14">
        <Categories />
        <RecentGestures />
        <Featured />
        {/* The one banner slot: it mounts after hydration, below the fold (review M6). */}
        <SiteAppBanner />
      </Page>
    </>
  );
}
