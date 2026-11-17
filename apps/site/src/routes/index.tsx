import {
  APP_STORE_URL,
  COURSE_URL,
  PLAY_STORE_URL,
} from "@smog/config/constants";
import {
  categoriesOptions,
  FEATURED_LIMIT,
  gesturesPageOptions,
  useCategories,
  useFeaturedGestures,
} from "@smog/gestures/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { Button, ErrorState, Heading, Text, TextLink } from "@smog/ui-web";
import { muxThumbnailUrl } from "@smog/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ExternalLink } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SiteAppBanner } from "@/components/app-banner";
import { HeroHand } from "@/components/home/hero-hand";
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

/** How many gestures the home shows, larger, out of the featured page. */
const PICKS = 4;
/** The width the cards request their still at (as `GestureCard`). */
const STILL_WIDTH = 480;
/** The picks' columns, shared by the grid and its skeleton. */
const PICKS_GRID = "sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-4";
/** The white focus ring on the deep green (the kit's `focusRingOnGreen`). */
const FOCUS_ON_GREEN =
  "focus-visible:ring-sidebar-ring focus-visible:ring-offset-sidebar";

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

/**
 * The ids of gestures whose still does not load. The home shows only
 * gestures with a picture: a blank card on the first page reads as broken.
 * The probe asks for the same URL as the card, so the card hits the cache.
 */
function useMissingStills(items: readonly GestureSummary[]): Set<string> {
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let active = true;
    for (const item of items) {
      const probe = new Image();
      probe.onerror = () => {
        if (active) {
          setMissing((previous) => new Set(previous).add(item.id));
        }
      };
      probe.src = muxThumbnailUrl(item.playbackId, { width: STILL_WIDTH });
    }
    return () => {
      active = false;
    };
  }, [items]);
  return missing;
}

/** A few gestures, larger: the first of the featured page with a still. */
function Picks(): ReactNode {
  const { t } = useTranslation();
  const featured = useFeaturedGestures(FEATURED_LIMIT);
  const hearts = useHearts();
  const missing = useMissingStills(featured.data ?? []);
  const { refetch } = featured;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  let body: ReactNode;
  if (featured.data) {
    const picks = featured.data
      .filter((gesture) => !missing.has(gesture.id))
      .slice(0, PICKS);
    if (picks.length === 0) {
      return null;
    }
    body = (
      <LinkedGestureGrid
        className={PICKS_GRID}
        hearts={hearts}
        items={picks}
        level={3}
      />
    );
  } else if (featured.isError) {
    body = <ErrorState onRetry={retry} retrying={featured.isRefetching} />;
  } else {
    body = <GestureGridSkeleton className={PICKS_GRID} count={PICKS} />;
  }
  return (
    <section aria-labelledby="home-picks-title" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <Heading id="home-picks-title" level={2} size="title-1">
          {t("home.picksTitle")}
        </Heading>
        <TextLink
          asChild
          className="inline-flex min-h-touch items-center gap-2"
        >
          <Link to="/gestures">
            {t("home.browseAll")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </TextLink>
      </div>
      {body}
    </section>
  );
}

function Contents(): ReactNode {
  const categories = useCategories();
  return <CategoryTiles categories={categories.data ?? []} />;
}

/** What SMOG is, and that the videos sit beside a course, not instead of it. */
function About(): ReactNode {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="home-about-title"
      className="grid gap-4 border-border-subtle border-t pt-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:pt-14"
    >
      <Heading id="home-about-title" level={2} size="title-1">
        {t("home.aboutTitle")}
      </Heading>
      <div className="flex max-w-reading flex-col gap-4">
        <Text size="lead">{t("home.aboutBody")}</Text>
        <Text tone="muted">{t("home.aboutMemory")}</Text>
        <TextLink
          className="inline-flex min-h-touch items-center gap-2 self-start"
          href={COURSE_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("home.aboutCourse")}
          <ExternalLink aria-hidden className="size-4" />
        </TextLink>
      </div>
    </section>
  );
}

/**
 * The app, from `md` (on a phone the app banner below takes this place, with
 * its dismissal).
 */
function App(): ReactNode {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="home-app-title"
      className="hidden gap-4 border-border-subtle border-t pt-10 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:pt-14"
    >
      <Heading id="home-app-title" level={2} size="title-1">
        {t("appBanner.title")}
      </Heading>
      <div className="flex max-w-reading flex-col gap-4">
        <Text tone="muted">{t("appBanner.description")}</Text>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={APP_STORE_URL} rel="noopener noreferrer" target="_blank">
              App Store
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={PLAY_STORE_URL} rel="noopener noreferrer" target="_blank">
              Google Play
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/** The sponsor invitation: the one large orange action on the page. */
function Sponsor(): ReactNode {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="home-sponsor-title"
      className="flex flex-col items-start gap-5 rounded-card bg-sidebar px-6 py-10 text-sidebar-foreground md:px-12 md:py-14"
    >
      <Heading
        className="max-w-2xl text-sidebar-foreground"
        id="home-sponsor-title"
        level={2}
        size="title-1"
      >
        {t("home.sponsorTitle")}
      </Heading>
      <Text className="max-w-reading text-sidebar-foreground-muted">
        {t("home.sponsorBody")}
      </Text>
      <Button asChild className={FOCUS_ON_GREEN} size="lg" variant="action">
        <Link to="/sponsor">{t("home.sponsorAction")}</Link>
      </Button>
    </section>
  );
}

/**
 * Home: the deep green hero (the method's name, the tagline as the heading,
 * the course line and the search, with the pointing hand drawing itself
 * towards it), then a reference catalogue: "continue where you left off"
 * (this device's recent gestures), the themes as a contents list, a few
 * gestures, what SMOG is, the app and the sponsor invitation. The parts
 * that mount after hydration (recents, the app banner) sit under what is
 * visible first, so the hero stays put.
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
      <section className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex w-full max-w-content flex-col px-4 pt-12 pb-14 md:px-6 md:pt-20 md:pb-24 lg:px-8">
          <div className="flex max-w-4xl flex-col gap-5">
            <p
              className="font-medium text-body text-sidebar-foreground-muted"
              lang="nl"
            >
              {t("home.eyebrow")}
            </p>
            <Heading
              className="text-sidebar-foreground"
              level={1}
              size="display"
            >
              {t("home.tagline")}
            </Heading>
            <Text
              className="max-w-reading text-sidebar-foreground-muted"
              size="lead"
            >
              {t("home.intro")}
            </Text>
          </div>
          <div className="mt-6 flex flex-col sm:mt-10 sm:flex-row-reverse sm:items-center sm:justify-end sm:gap-6">
            <HeroHand className="-mb-1 h-12 -rotate-12 self-end text-sidebar-foreground sm:mb-0 sm:h-20 sm:rotate-0 sm:self-auto lg:h-28" />
            <div className="w-full max-w-2xl">
              <SearchBox
                action="/gestures"
                label={t("home.searchLabel")}
                onGreen
                onSubmit={submit}
                onValueChange={setText}
                placeholder={t("home.searchPlaceholder")}
                submitLabel={t("home.searchSubmit")}
                value={text}
              />
            </div>
          </div>
        </div>
      </section>
      <Page className="gap-16 py-12 md:gap-24 md:py-20">
        <RecentGestures />
        <Contents />
        <Picks />
        <About />
        <App />
        <Sponsor />
        {/* The one banner slot: it mounts after hydration, below the fold (review M6). */}
        <SiteAppBanner />
      </Page>
    </>
  );
}
