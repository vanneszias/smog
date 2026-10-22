import {
  useCategories,
  useGestureSearch,
  useRecentSearches,
} from "@smog/gestures/client";
import type { GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Command as CommandRoot,
  CommandSeparator,
} from "@smog/ui-web/command";
import { muxThumbnailUrl } from "@smog/utils";
import { useNavigate } from "@tanstack/react-router";
import { History, Search, Tag } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
 * The global search (`/` or the header's button): a command palette with
 * the gestures that match (ranked on the server, as the search page does),
 * the matching categories and, before anything is typed, the recent
 * searches. This file is its own chunk (`search-palette-provider`).
 */

const RESULT_LIMIT = 6;
const CATEGORY_LIMIT = 6;

/** Lower case without accents, for a forgiving category match. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function gestureLine(gesture: GestureSummary): string {
  return gesture.categories.map((category) => category.name).join(", ");
}

export interface SearchPaletteProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/** The palette dialog; its body (and so its queries) exist only while open. */
export function SearchPalette({
  onOpenChange,
  open,
}: SearchPaletteProps): ReactNode {
  const { t } = useTranslation();
  return (
    <CommandDialog
      description={t("searchPalette.description")}
      onOpenChange={onOpenChange}
      open={open}
      title={t("common.search")}
    >
      <PaletteBody onOpenChange={onOpenChange} />
    </CommandDialog>
  );
}

function PaletteBody({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const typed = query.trim();
  // The palette is not the catalogue search `search_performed` measures.
  const found = useGestureSearch({
    limit: RESULT_LIMIT,
    q: query,
    track: false,
  });
  const categories = useCategories();
  const recent = useRecentSearches();
  const { add } = recent;

  const matchingCategories = useMemo(() => {
    const all = categories.data ?? [];
    const needle = fold(typed);
    const list =
      needle === ""
        ? all
        : all.filter((category) => fold(category.name).includes(needle));
    return list.slice(0, CATEGORY_LIMIT);
  }, [categories.data, typed]);

  const go = useCallback(
    (to: () => Promise<void>): void => {
      onOpenChange(false);
      to().catch((error: unknown) => {
        console.error("[search] Failed to open the result:", error);
      });
    },
    [onOpenChange]
  );
  const openGesture = useCallback(
    (slug: string): void =>
      go(() => navigate({ params: { slug }, to: "/gestures/$slug" })),
    [go, navigate]
  );
  const openCategory = useCallback(
    (slug: string): void =>
      go(() => navigate({ search: { category: slug }, to: "/gestures" })),
    [go, navigate]
  );
  const openSearch = useCallback(
    (text: string): void => {
      if (text) {
        add(text).catch((error: unknown) => {
          console.error("[search] Failed to store a recent search:", error);
        });
      }
      go(() =>
        navigate({
          search: text ? { q: text } : {},
          to: "/gestures",
        })
      );
    },
    [add, go, navigate]
  );

  // The ranked list is the server's: cmdk only moves the highlight.
  const gestures = typed === "" ? [] : (found.data?.items ?? []);
  const showRecent = typed === "" && recent.items.length > 0;
  // cmdk keeps the highlight where it was when the list changes under it
  // (the server's answer arrives after the debounce): Enter must open the
  // first item as it is now, so the highlight is controlled and reset here.
  let first = "see-all";
  if (showRecent) {
    first = `recent:${recent.items[0]}`;
  } else if (gestures[0]) {
    first = `gesture:${gestures[0].id}`;
  } else if (matchingCategories[0]) {
    first = `category:${matchingCategories[0].slug}`;
  }
  let status = "";
  if (typed === "") {
    // Nothing typed, nothing to report.
  } else if (found.isError) {
    status = t("searchPalette.error");
  } else if (found.isDebouncing || found.isFetching || !found.data) {
    status = t("search.searching");
  } else if (found.data.total === 0) {
    status = t("search.noResults.title");
  } else {
    status = t("search.resultCount", { count: found.data.total });
  }
  const [highlight, setHighlight] = useState(first);
  useEffect(() => {
    setHighlight(first);
  }, [first]);
  return (
    <CommandRoot
      loop
      onValueChange={setHighlight}
      shouldFilter={false}
      value={highlight}
    >
      <CommandInput
        onValueChange={setQuery}
        placeholder={t("searchPalette.placeholder")}
        value={query}
      />
      {/* "Show all results" is always listed once something is typed, so cmdk
          never renders its empty state then: this line is the palette's
          visible and spoken feedback (searching, failed, none, how many). */}
      <div
        aria-live="polite"
        className="px-4 pt-2 text-body-sm text-muted-foreground empty:hidden"
        data-testid="palette-status"
        role="status"
      >
        {status}
      </div>
      <CommandList>
        <CommandEmpty>{t("search.noResults.title")}</CommandEmpty>
        {showRecent ? (
          <CommandGroup heading={t("search.recent")}>
            {recent.items.map((item) => (
              <RecentItem item={item} key={item} onPick={openSearch} />
            ))}
          </CommandGroup>
        ) : null}
        {gestures.length > 0 ? (
          <CommandGroup heading={t("nav.gestures")}>
            {gestures.map((gesture) => (
              <GestureItem
                gesture={gesture}
                key={gesture.id}
                onPick={openGesture}
              />
            ))}
          </CommandGroup>
        ) : null}
        {matchingCategories.length > 0 ? (
          <CommandGroup heading={t("search.categories")}>
            {matchingCategories.map((category) => (
              <CategoryItem
                key={category.slug}
                name={category.name}
                onPick={openCategory}
                slug={category.slug}
              />
            ))}
          </CommandGroup>
        ) : null}
        {typed === "" ? null : (
          <>
            <CommandSeparator />
            <CommandGroup>
              <SeeAllItem onPick={openSearch} query={typed} />
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandRoot>
  );
}

function RecentItem({
  item,
  onPick,
}: {
  item: string;
  onPick: (query: string) => void;
}): ReactNode {
  const select = useCallback((): void => onPick(item), [item, onPick]);
  return (
    <CommandItem onSelect={select} value={`recent:${item}`}>
      <History aria-hidden="true" />
      {item}
    </CommandItem>
  );
}

function GestureItem({
  gesture,
  onPick,
}: {
  gesture: GestureSummary;
  onPick: (slug: string) => void;
}): ReactNode {
  const select = useCallback(
    (): void => onPick(gesture.slug),
    [gesture.slug, onPick]
  );
  const categories = gestureLine(gesture);
  return (
    <CommandItem onSelect={select} value={`gesture:${gesture.id}`}>
      <img
        alt=""
        className="h-10 w-[30px] shrink-0 rounded-md bg-muted object-cover"
        decoding="async"
        height={40}
        loading="lazy"
        src={muxThumbnailUrl(gesture.playbackId, { width: 60 })}
        width={30}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{gesture.name}</span>
        {categories ? (
          <span className="truncate text-body-sm text-muted-foreground">
            {categories}
          </span>
        ) : null}
      </span>
    </CommandItem>
  );
}

function CategoryItem({
  name,
  onPick,
  slug,
}: {
  name: string;
  onPick: (slug: string) => void;
  slug: string;
}): ReactNode {
  const select = useCallback((): void => onPick(slug), [onPick, slug]);
  return (
    <CommandItem onSelect={select} value={`category:${slug}`}>
      <Tag aria-hidden="true" />
      {name}
    </CommandItem>
  );
}

function SeeAllItem({
  onPick,
  query,
}: {
  onPick: (query: string) => void;
  query: string;
}): ReactNode {
  const { t } = useTranslation();
  const select = useCallback((): void => onPick(query), [onPick, query]);
  return (
    <CommandItem onSelect={select} value="see-all">
      <Search aria-hidden="true" />
      {t("searchPalette.seeAll", { query })}
    </CommandItem>
  );
}
