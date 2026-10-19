import {
  LOGO_ADDON_PER_GESTURE_CENTS,
  MAX_GESTURES_PER_CHECKOUT,
  PRICE_PER_GESTURE_YEAR_CENTS,
} from "@smog/config/constants";
import type { Category, GestureSummary } from "@smog/gestures/schema";
import { useTranslation } from "@smog/i18n/react";
import { RENDER_OVERLAY_LAYOUT } from "@smog/render/contract";
import type { WizardGesture, WizardState } from "@smog/sponsorships/client";
import type { AvailabilityItem } from "@smog/sponsorships/schema";
import {
  Badge,
  Button,
  CategoryChips,
  cn,
  EmptyState,
  ErrorState,
  Heading,
  SearchField,
  Skeleton,
  Text,
} from "@smog/ui-web";
import { formatMoney, muxThumbnailUrl } from "@smog/utils";
import { Check, Heart } from "lucide-react";
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { usePageLocale } from "./page-locale";

/** Category chips shown before "+N more" (S-03). */
const CHIPS_SHOWN = 8;

export interface SelectSearch {
  categories: string[];
  q: string;
}

export interface StepSelectProps {
  availability: ReadonlyMap<string, AvailabilityItem>;
  /** A failed availability read, with a retry of the failed reads. */
  availabilityError: { retry: () => void; retrying: boolean } | null;
  categories: readonly Category[];
  onSearch: (search: SelectSearch) => void;
  onToggle: (gesture: WizardGesture) => void;
  results: {
    data: readonly GestureSummary[] | undefined;
    /** Browsing: more pages to load (`gestures.list`, keyset). */
    hasMore: boolean;
    isError: boolean;
    isRefetching: boolean;
    loadingMore: boolean;
    onLoadMore: () => void;
    /** Searching: all matches, when more than the page shows. */
    partialOf: number | null;
    refetch: () => void;
  };
  search: SelectSearch;
  state: WizardState;
  /** The step's title, focused when the step opens. */
  titleRef: (node: HTMLHeadingElement | null) => void;
}

/** The three value cards (bug 24: every figure from the constants). */
function ValueCards(): ReactNode {
  const { t } = useTranslation();
  const locale = usePageLocale();
  const cards = [
    {
      label: t("sponsor.select.value.perGesture"),
      value: formatMoney(PRICE_PER_GESTURE_YEAR_CENTS, locale),
    },
    {
      label: t("sponsor.select.value.nameInVideo"),
      value: t("sponsor.select.value.seconds", {
        seconds: RENDER_OVERLAY_LAYOUT.overlaySeconds,
      }),
    },
    {
      label: t("sponsor.select.value.optionalLogo"),
      value: t("sponsor.select.value.logoPrice", {
        price: formatMoney(LOGO_ADDON_PER_GESTURE_CENTS, locale),
      }),
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <li
          className="flex flex-col gap-1 rounded-lg border border-border-subtle bg-surface p-4"
          key={card.label}
        >
          <span className="font-semibold text-primary-strong text-title-2 tabular-nums">
            {card.value}
          </span>
          <span className="text-body-sm text-foreground-muted">
            {card.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

type CardState = "available" | "pending" | "sponsored" | "taken";

function cardState(
  gesture: GestureSummary,
  availability: ReadonlyMap<string, AvailabilityItem>,
  taken: readonly string[]
): CardState | null {
  if (taken.includes(gesture.id)) {
    return "taken";
  }
  const item = availability.get(gesture.id);
  if (!item) {
    return null;
  }
  if (item.state === "unavailable") {
    return "taken";
  }
  return item.state;
}

const BADGE_KEYS = {
  pending: "sponsor.select.badge.pending",
  sponsored: "sponsor.select.badge.sponsored",
  taken: "sponsor.select.badge.taken",
} as const;

/** A gesture as a toggle (S-03): its still, name, categories and state. */
function GestureToggle({
  gesture,
  onToggle,
  selected,
  state,
}: {
  gesture: GestureSummary;
  onToggle: (gesture: WizardGesture) => void;
  selected: boolean;
  state: CardState | null;
}): ReactNode {
  const { t } = useTranslation();
  const id = useId();
  const toggle = useCallback(
    () =>
      onToggle({
        id: gesture.id,
        name: gesture.name,
        playbackId: gesture.playbackId,
        slug: gesture.slug,
      }),
    [gesture, onToggle]
  );
  const blocked = state !== null && state !== "available";
  const [first, second, ...rest] = gesture.categories;
  const nameId = `${id}-name`;
  const badgeId = `${id}-badge`;
  return (
    <li className="min-w-0">
      {/* Named by the gesture; the badge says why it cannot be chosen. */}
      <button
        aria-describedby={blocked ? badgeId : undefined}
        aria-labelledby={nameId}
        aria-pressed={selected}
        className={cn(
          "group relative flex w-full flex-col overflow-hidden rounded-lg border-2 bg-surface text-left text-foreground transition",
          "focus-visible:outline-2 focus-visible:outline-focus-ring focus-visible:outline-offset-2",
          selected
            ? "border-primary"
            : "border-border-subtle hover:border-border hover:shadow-1",
          blocked &&
            "cursor-not-allowed hover:border-border-subtle hover:shadow-0"
        )}
        data-state={state ?? "loading"}
        // A chosen card that became blocked can still be deselected.
        disabled={!selected && (blocked || state === null)}
        onClick={toggle}
        type="button"
      >
        <img
          alt=""
          className={cn(
            "aspect-3/4 w-full bg-surface-sunken object-cover",
            blocked && "opacity-50"
          )}
          decoding="async"
          height={640}
          loading="lazy"
          src={muxThumbnailUrl(gesture.playbackId, { width: 480 })}
          width={480}
        />
        <span
          className={cn(
            "flex min-w-0 flex-col gap-1 p-3",
            blocked && "opacity-50"
          )}
        >
          <span className="truncate font-semibold text-title-3" id={nameId}>
            {gesture.name}
          </span>
          {first ? (
            <span className="flex flex-wrap gap-1">
              {[first, second]
                .filter((category) => category !== undefined)
                .map((category) => (
                  <Badge key={category.slug}>{category.name}</Badge>
                ))}
              {rest.length > 0 ? <Badge>+{rest.length}</Badge> : null}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-2 right-2 inline-flex size-6 items-center justify-center rounded-sm border-2",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface"
          )}
        >
          {selected ? <Check className="size-4" strokeWidth={3} /> : null}
        </span>
        {blocked ? (
          <Badge
            className="absolute top-2 left-2"
            icon={state === "sponsored" ? <Heart /> : undefined}
            id={badgeId}
            variant={state === "taken" ? "danger" : "warning"}
          >
            {t(BADGE_KEYS[state])}
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

/** The grid's states: failed, loading, empty (clear the filters), or the cards. */
function Grid({
  availability,
  clearFilters,
  onToggle,
  results,
  selectedIds,
  taken,
}: {
  availability: ReadonlyMap<string, AvailabilityItem>;
  clearFilters: (() => void) | undefined;
  onToggle: (gesture: WizardGesture) => void;
  results: StepSelectProps["results"];
  selectedIds: ReadonlySet<string>;
  taken: readonly string[];
}): ReactNode {
  const { t } = useTranslation();
  const items = results.data;
  if (results.isError) {
    return (
      <ErrorState
        level={2}
        onRetry={results.refetch}
        retrying={results.isRefetching}
      />
    );
  }
  if (items === undefined) {
    return (
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
          <li key={index}>
            <Skeleton className="aspect-3/4 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        action={
          clearFilters ? (
            <Button onClick={clearFilters} variant="secondary">
              {t("sponsor.select.clearFilters")}
            </Button>
          ) : undefined
        }
        description={t("sponsor.select.empty.description")}
        level={2}
        title={t("sponsor.select.empty.title")}
      />
    );
  }
  return (
    <ul
      className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4"
      data-testid="sponsor-grid"
    >
      {items.map((gesture) => (
        <GestureToggle
          gesture={gesture}
          key={gesture.id}
          onToggle={onToggle}
          selected={selectedIds.has(gesture.id)}
          state={cardState(gesture, availability, taken)}
        />
      ))}
    </ul>
  );
}

/** The first 8 categories (and any chosen beyond them), or all. */
function useChips(
  categories: readonly Category[],
  selected: readonly string[]
): {
  expanded: boolean;
  hidden: number;
  shown: readonly Category[];
  toggle: () => void;
} {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  const shown = useMemo(
    () =>
      expanded
        ? categories
        : categories.filter(
            (category, index) =>
              index < CHIPS_SHOWN || selected.includes(category.slug)
          ),
    [categories, expanded, selected]
  );
  return { expanded, hidden: categories.length - shown.length, shown, toggle };
}

/**
 * Step 1, "Choose gestures" (S-03): the value cards, the whole catalogue
 * a keyset page at a time (`gestures.list`, "Load more") or a search over
 * `gestures.search` (with a note when it shows part of its matches), the
 * category chips, the result line, and a grid of
 * toggle cards with their availability. Sponsored, pending and just-taken
 * gestures are disabled, and so is a card whose availability is unknown
 * (a failed read says so above the grid, with Retry). At most 10 per
 * payment, with the reason. The grid's states are h2s under the step's h1.
 */
export function StepSelect({
  availability,
  availabilityError,
  categories,
  onSearch,
  onToggle,
  results,
  search,
  state,
  titleRef,
}: StepSelectProps): ReactNode {
  const { t } = useTranslation();
  const chips = useChips(categories, search.categories);
  const setQuery = useCallback(
    (q: string) => onSearch({ ...search, q }),
    [onSearch, search]
  );
  const clearQuery = useCallback(
    () => onSearch({ ...search, q: "" }),
    [onSearch, search]
  );
  const setCategories = useCallback(
    (next: string[]) => onSearch({ ...search, categories: next }),
    [onSearch, search]
  );
  const clearFilters = useCallback(
    () => onSearch({ categories: [], q: "" }),
    [onSearch]
  );
  const selectedIds = useMemo(
    () => new Set(state.selected.map((gesture) => gesture.id)),
    [state.selected]
  );
  const items = results.data;
  const availableCount =
    items?.filter(
      (gesture) => cardState(gesture, availability, state.taken) === "available"
    ).length ?? 0;
  const filtered = search.q.trim() !== "" || search.categories.length > 0;

  const grid = (
    <Grid
      availability={availability}
      clearFilters={filtered ? clearFilters : undefined}
      onToggle={onToggle}
      results={results}
      selectedIds={selectedIds}
      taken={state.taken}
    />
  );

  return (
    <section
      aria-labelledby="sponsor-select-title"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Heading
          id="sponsor-select-title"
          level={1}
          ref={titleRef}
          size="title-1"
          tabIndex={-1}
        >
          {t("sponsor.select.title")}
        </Heading>
        <Text className="max-w-reading" tone="muted">
          {t("sponsor.select.description")}
        </Text>
      </div>
      <ValueCards />
      {state.taken.length > 0 ? (
        <Text
          className="rounded-md bg-warning-subtle p-3 text-warning-strong"
          role="alert"
        >
          {t("sponsor.select.taken")}
        </Text>
      ) : null}
      <div className="flex flex-col gap-3">
        <SearchField
          aria-label={t("sponsor.select.search")}
          onClear={clearQuery}
          onValueChange={setQuery}
          placeholder={t("sponsor.select.searchPlaceholder")}
          value={search.q}
        />
        {categories.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChips
              categories={chips.shown}
              className="md:flex-1"
              onChange={setCategories}
              selected={search.categories}
            />
            {categories.length > CHIPS_SHOWN ? (
              <Button onClick={chips.toggle} size="sm" variant="ghost">
                {chips.expanded
                  ? t("sponsor.select.showLess")
                  : t("sponsor.select.showMore", { count: chips.hidden })}
              </Button>
            ) : null}
            {filtered ? (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                {t("sponsor.select.clearFilters")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {/* Not live: the selection bar announces the count (review Minor 6). */}
        <Text size="body-sm" tone="muted">
          {items === undefined
            ? null
            : `${t("sponsor.select.available", { count: availableCount })} · ${t(
                "sponsor.select.selected",
                { count: state.selected.length }
              )}`}
        </Text>
      </div>
      {state.limitReached ? (
        <Text
          className="rounded-md bg-primary-subtle p-3 text-primary-strong"
          role="status"
        >
          {t("sponsor.select.limit", { max: MAX_GESTURES_PER_CHECKOUT })}
        </Text>
      ) : null}
      {availabilityError && !results.isError ? (
        // The cards stay in view, but cannot be chosen until it answers.
        <ErrorState
          description={t("sponsor.select.availabilityError.description")}
          level={2}
          onRetry={availabilityError.retry}
          retrying={availabilityError.retrying}
          title={t("sponsor.select.availabilityError.title")}
        />
      ) : null}
      {grid}
      {results.partialOf === null || items === undefined ? null : (
        <Text className="text-center" size="body-sm" tone="muted">
          {t("sponsor.select.partial", {
            shown: items.length,
            total: results.partialOf,
          })}
        </Text>
      )}
      {results.hasMore ? (
        <Button
          className="self-center"
          loading={results.loadingMore}
          onClick={results.onLoadMore}
          variant="secondary"
        >
          {t("sponsor.select.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
