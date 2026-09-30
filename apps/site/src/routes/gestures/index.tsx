import type { SearchSource } from "@smog/analytics/schema";
import {
  SEARCH_DEBOUNCE_MS,
  useCategories,
  useGestureSearch,
  useGestures,
} from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import { Button, CategoryChips, Text } from "@smog/ui-web";
import { createFileRoute } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Page, PageHeader, RouteError } from "@/components/learning/page";
import { ResultsView } from "@/components/learning/results-view";
import type { SearchTrigger } from "@/components/learning/search-box";
import { SearchBox } from "@/components/learning/search-box";
import { SelectedGesture } from "@/components/learning/selected-gesture";
import { type Hearts, useHearts } from "@/components/learning/use-hearts";
import { prefetchBrowse, SEARCH_LIMIT } from "@/lib/gesture-queries";
import {
  formatCategories,
  type GesturesSearch,
  parseCategories,
  validateGesturesSearch,
} from "@/lib/gestures-search";
import { seoHead, shellHead } from "@/lib/head";

export const Route = createFileRoute("/gestures/")({
  component: Gestures,
  errorComponent: RouteError,
  head: ({ matches }) => {
    const { t } = shellHead(matches);
    return seoHead(matches, {
      description: t("gestures.description"),
      path: "/gestures",
      title: t("nav.gestures"),
    });
  },
  // `selected` is not a dependency: picking a gesture loads only its detail.
  loader: ({ context, deps }) =>
    prefetchBrowse(
      context.queryClient,
      context.queryUtils,
      deps.q,
      parseCategories(deps.category)
    ),
  loaderDeps: ({ search }: { search: GesturesSearch }) => ({
    category: search.category ?? "",
    q: search.q ?? "",
  }),
  validateSearch: validateGesturesSearch,
});

interface ResultsProps {
  categories: readonly string[];
  hearts: Hearts;
  /** Clears the category filter (the empty state's next action), if any. */
  onClearFilters: (() => void) | undefined;
  selected: string | undefined;
}

type ResultsState = "empty" | "error" | "loading" | "results";

function resultsState(
  data: unknown,
  isError: boolean,
  empty: boolean
): ResultsState {
  if (data === undefined) {
    return isError ? "error" : "loading";
  }
  return empty ? "empty" : "results";
}

function ClearFilters({
  onClear,
}: {
  onClear: (() => void) | undefined;
}): ReactNode {
  const { t } = useTranslation();
  if (!onClear) {
    return null;
  }
  return (
    <Button onClick={onClear} variant="secondary">
      {t("search.clearFilters")}
    </Button>
  );
}

/** Ranked results for a query (spec §7.1), at most `SEARCH_LIMIT`. */
function QueryResults({
  categories,
  hearts,
  onClearFilters,
  q,
  selected,
  source,
}: ResultsProps & { q: string; source: SearchSource }): ReactNode {
  const { t } = useTranslation();
  const search = useGestureSearch({
    category: categories,
    limit: SEARCH_LIMIT,
    q,
    source,
  });
  const { refetch } = search;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  const items = search.data?.items ?? [];
  const more = (search.data?.total ?? 0) > items.length;
  return (
    <ResultsView
      emptyAction={<ClearFilters onClear={onClearFilters} />}
      footer={
        more ? (
          <Text size="body-sm" tone="muted">
            {t("search.refine")}
          </Text>
        ) : undefined
      }
      hearts={hearts}
      items={items}
      onRetry={retry}
      retrying={search.isRefetching}
      selected={selected}
      state={resultsState(search.data, search.isError, items.length === 0)}
    />
  );
}

/** The catalogue by name (no query), a page at a time. */
function BrowseResults({
  categories,
  hearts,
  onClearFilters,
  selected,
}: ResultsProps): ReactNode {
  const { t } = useTranslation();
  const browse = useGestures({ category: categories });
  const { fetchNextPage, refetch } = browse;
  const retry = useCallback(() => {
    refetch();
  }, [refetch]);
  const loadMore = useCallback(() => {
    fetchNextPage();
  }, [fetchNextPage]);
  const items = browse.data ?? [];
  return (
    <ResultsView
      emptyAction={<ClearFilters onClear={onClearFilters} />}
      footer={
        browse.hasNextPage ? (
          <Button
            className="self-center"
            loading={browse.isFetchingNextPage}
            onClick={loadMore}
            variant="secondary"
          >
            {t("kit.loadMore")}
          </Button>
        ) : undefined
      }
      hearts={hearts}
      items={items}
      onRetry={retry}
      retrying={browse.isRefetching}
      selected={selected}
      state={resultsState(browse.data, browse.isError, items.length === 0)}
    />
  );
}

/**
 * Browse and search (spec §16 flow 1): the field (recent searches while
 * it is empty and focused), the category chips and the results, synced to
 * `?q=` and `?category=` with `replace` navigation. From `lg`, a picked
 * gesture shows beside the results and the URL reads `/gestures/<slug>`.
 */
function Gestures(): ReactNode {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const hearts = useHearts("search_results");
  const categories = useCategories();
  const selectedCategories = useMemo(
    () => parseCategories(search.category),
    [search.category]
  );
  const [text, setText] = useState(search.q ?? "");
  // What search_performed reports, as on mobile: typing and filters, a
  // submit (also a `?q=` landing, from Home or a link), or a recent search.
  const [source, setSource] = useState<SearchSource>(
    search.q ? "submit" : "filter_change"
  );
  const type = useCallback((value: string): void => {
    setSource("filter_change");
    setText(value);
  }, []);
  // The q this page wrote last: a URL change from elsewhere (back, a link)
  // replaces the field; our own debounced write does not.
  const written = useRef(search.q ?? "");

  const { selected } = search;
  const update = useCallback(
    (patch: GesturesSearch): void => {
      navigate({
        // A gesture open beside the results stays open (and in the URL).
        mask: selected
          ? { params: { slug: selected }, to: "/gestures/$slug" }
          : undefined,
        replace: true,
        resetScroll: false,
        search: (previous) => validateGesturesSearch({ ...previous, ...patch }),
      }).catch((error: unknown) => {
        console.error("[gestures] Failed to update the search:", error);
      });
    },
    [navigate, selected]
  );

  useEffect(() => {
    const q = search.q ?? "";
    if (q !== written.current) {
      written.current = q;
      setSource("submit");
      setText(q);
    }
  }, [search.q]);

  useEffect(() => {
    const q = text.trim();
    if (q === written.current) {
      return;
    }
    const timer = setTimeout(() => {
      written.current = q;
      update({ q: q || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, update]);

  const submit = useCallback(
    (query: string, trigger: SearchTrigger): void => {
      written.current = query;
      setSource(trigger);
      update({ q: query || undefined });
    },
    [update]
  );
  const changeCategories = useCallback(
    (slugs: string[]): void => {
      setSource("filter_change");
      update({ category: formatCategories(slugs) });
    },
    [update]
  );
  const clearCategories = useCallback((): void => {
    setSource("filter_change");
    update({ category: undefined });
  }, [update]);
  // While the field is emptied, the last query shows until the URL follows.
  const q = text.trim() ? text : (search.q ?? "");
  const results: ResultsProps = {
    categories: selectedCategories,
    hearts,
    onClearFilters: selectedCategories.length > 0 ? clearCategories : undefined,
    selected,
  };

  return (
    <Page>
      <PageHeader title={t("nav.gestures")} />
      <div className="flex flex-col gap-4">
        <SearchBox
          label={t("home.searchLabel")}
          onSubmit={submit}
          onValueChange={type}
          placeholder={t("home.searchPlaceholder")}
          value={text}
        />
        <CategoryChips
          categories={categories.data ?? []}
          onChange={changeCategories}
          selected={selectedCategories}
        />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col">
          {search.q ? (
            <QueryResults {...results} q={q} source={source} />
          ) : (
            <BrowseResults {...results} />
          )}
        </div>
        <aside
          aria-label={t("gestures.select.title")}
          className="hidden lg:block"
        >
          <div className="sticky top-24">
            <SelectedGesture slug={selected} />
          </div>
        </aside>
      </div>
    </Page>
  );
}
