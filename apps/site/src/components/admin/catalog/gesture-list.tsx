import { useAdminCategories, useAdminGestures } from "@smog/admin/client";
import {
  ADMIN_GESTURE_PAGE_MAX,
  type AdminCategory,
  type AdminGestureListInput,
  type AdminGesturePage,
  type AdminGestureRow,
  GESTURE_NAME_MAX,
} from "@smog/admin/schema";
import { useDebouncedValue } from "@smog/gestures/client";
import { useTranslation } from "@smog/i18n/react";
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  SearchField,
  SegmentedControl,
  Select,
  Skeleton,
} from "@smog/ui-web";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ChevronsLeft, Hand, X } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BulkBar } from "./bulk-bar";
import { GestureTable } from "./gesture-table";
import { GestureTableEditor } from "./gesture-table-editor";

/** The list's filters as they live in the URL (`/admin/gestures?…`). */
export interface GestureListSearch {
  category?: string | undefined;
  /** The page's start (a cursor from the previous page). */
  cursor?: string | undefined;
  q?: string | undefined;
  status?: "published" | "unpublished" | undefined;
}

const CATEGORY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SEARCH_DELAY_MS = 300;
const ALL = "all";

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : undefined;
}

/**
 * Every key set (`undefined` when absent or invalid): the root route
 * validates no search, so an omitted key would keep the raw value.
 */
export function validateGestureListSearch(
  search: Record<string, unknown>
): GestureListSearch {
  return {
    category:
      typeof search.category === "string" && CATEGORY_ID.test(search.category)
        ? search.category
        : undefined,
    cursor: text(search.cursor, 1024),
    q: text(search.q, GESTURE_NAME_MAX),
    status:
      search.status === "published" || search.status === "unpublished"
        ? search.status
        : undefined,
  };
}

/**
 * The list input for the URL's filters. A page holds 100 rows (the
 * contract's maximum, also `bulkUpdate`'s), so "select all" covers it.
 */
function gestureListInput(search: GestureListSearch): AdminGestureListInput {
  return {
    category: search.category ? [search.category] : undefined,
    cursor: search.cursor,
    limit: ADMIN_GESTURE_PAGE_MAX,
    q: search.q,
    status: search.status ?? "all",
  };
}

function Stats({ counts }: { counts: AdminGesturePage["counts"] }): ReactNode {
  const { t } = useTranslation();
  const items = [
    { label: t("admin.gestures.stats.total"), value: counts.total },
    { label: t("admin.gestures.stats.published"), value: counts.published },
    { label: t("admin.gestures.stats.hidden"), value: counts.unpublished },
  ];
  return (
    <dl
      aria-label={t("admin.gestures.stats.label")}
      className="grid grid-cols-3 gap-2 sm:max-w-reading"
    >
      {items.map((item) => (
        <div
          className="flex flex-col rounded-lg border border-border-subtle bg-surface px-3 py-2"
          key={item.label}
        >
          <dt className="text-caption text-foreground-muted">{item.label}</dt>
          <dd className="font-semibold text-title-3 tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Filters({
  onSearchChange,
  search,
}: {
  onSearchChange: (next: GestureListSearch) => void;
  search: GestureListSearch;
}): ReactNode {
  const { t } = useTranslation();
  const categories = useAdminCategories();
  const [query, setQuery] = useState(search.q ?? "");
  const settled = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  // The URL follows the typed text once it settles (only the settled text
  // moves it, so the latest filters are read through a ref); "Clear
  // filters" empties the field.
  const latest = useRef({ onSearchChange, search });
  latest.current = { onSearchChange, search };
  useEffect(() => {
    const { onSearchChange: change, search: current } = latest.current;
    if ((settled || undefined) !== current.q) {
      change({
        ...current,
        cursor: undefined,
        q: settled || undefined,
      });
    }
  }, [settled]);
  const set = useCallback(
    (patch: Partial<GestureListSearch>) =>
      onSearchChange({ ...search, ...patch, cursor: undefined }),
    [onSearchChange, search]
  );
  const onStatus = useCallback(
    (value: string) =>
      set({
        status:
          value === "published" || value === "unpublished" ? value : undefined,
      }),
    [set]
  );
  const onCategory = useCallback(
    (value: string) => set({ category: value === ALL ? undefined : value }),
    [set]
  );
  const clear = useCallback(() => {
    setQuery("");
    onSearchChange({});
  }, [onSearchChange]);
  const filtered = Boolean(search.q || search.status || search.category);
  return (
    <fieldset className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_auto]">
      <legend className="sr-only">{t("admin.gestures.filters.label")}</legend>
      <Field label={t("admin.gestures.filters.search")}>
        <SearchField
          onValueChange={setQuery}
          placeholder={t("admin.gestures.filters.searchPlaceholder")}
          value={query}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <span
          className="font-medium text-body-sm text-foreground"
          id="gesture-status-label"
        >
          {t("admin.gestures.filters.status")}
        </span>
        <SegmentedControl
          aria-labelledby="gesture-status-label"
          onValueChange={onStatus}
          options={[
            { label: t("admin.gestures.filters.all"), value: ALL },
            {
              label: t("admin.gestures.filters.published"),
              value: "published",
            },
            { label: t("admin.gestures.filters.hidden"), value: "unpublished" },
          ]}
          value={search.status ?? ALL}
        />
      </div>
      <Field label={t("admin.gestures.filters.category")}>
        <Select
          onValueChange={onCategory}
          options={[
            { label: t("admin.gestures.filters.allCategories"), value: ALL },
            ...(categories.data ?? []).map((category) => ({
              label:
                category.publishedAt === null
                  ? `${category.name} (${t("admin.categories.hiddenMark")})`
                  : category.name,
              value: category.id,
            })),
          ]}
          value={search.category ?? ALL}
        />
      </Field>
      <Button
        className="justify-self-start"
        disabled={!(filtered || query)}
        icon={<X />}
        onClick={clear}
        variant="ghost"
      >
        {t("admin.gestures.filters.clear")}
      </Button>
    </fieldset>
  );
}

function ListRows({
  categories,
  editing,
  onSelectedChange,
  onStopEditing,
  rows,
  selected,
}: {
  categories: readonly AdminCategory[];
  editing: boolean;
  onSelectedChange: (selected: ReadonlySet<string>) => void;
  onStopEditing: () => void;
  rows: readonly AdminGestureRow[];
  selected: ReadonlySet<string>;
}): ReactNode {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/gestures/new">{t("admin.gestures.new")}</Link>
          </Button>
        }
        description={t("admin.gestures.empty.description")}
        icon={<Hand />}
        level={2}
        title={t("admin.gestures.empty.title")}
      />
    );
  }
  if (editing) {
    return (
      <GestureTableEditor
        categories={categories}
        onStop={onStopEditing}
        rows={rows}
      />
    );
  }
  return (
    <GestureTable
      onSelectedChange={onSelectedChange}
      rows={rows}
      selected={selected}
    />
  );
}

function Pager({
  cursor,
  nextCursor,
  onSearchChange,
  search,
}: {
  cursor: string | undefined;
  nextCursor: string | null;
  onSearchChange: (next: GestureListSearch) => void;
  search: GestureListSearch;
}): ReactNode {
  const { t } = useTranslation();
  const firstPage = useCallback(
    () => onSearchChange({ ...search, cursor: undefined }),
    [onSearchChange, search]
  );
  const next = useCallback(() => {
    if (nextCursor) {
      onSearchChange({ ...search, cursor: nextCursor });
    }
  }, [nextCursor, onSearchChange, search]);
  if (!(cursor || nextCursor)) {
    return null;
  }
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {cursor ? (
        <Button icon={<ChevronsLeft />} onClick={firstPage} variant="secondary">
          {t("admin.gestures.firstPage")}
        </Button>
      ) : null}
      {nextCursor ? (
        <Button icon={<ChevronRight />} onClick={next} variant="secondary">
          {t("admin.gestures.nextPage")}
        </Button>
      ) : null}
    </div>
  );
}

export interface GestureListProps {
  /** "Edit table" mode (A-20). */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onSearchChange: (next: GestureListSearch) => void;
  search: GestureListSearch;
}

/**
 * `/admin/gestures` (A-18–A-21): the counts, URL filters, the table with
 * row selection and the bulk bar, keyset pages, and "Edit table" mode.
 */
export function GestureList({
  editing,
  onEditingChange,
  onSearchChange,
  search,
}: GestureListProps): ReactNode {
  const input = useMemo(() => gestureListInput(search), [search]);
  const gestures = useAdminGestures(input);
  const categories = useAdminCategories();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const nextCursor = gestures.data?.nextCursor ?? null;
  const inputKey = JSON.stringify(input);
  // A new filter or page starts with nothing selected.
  useEffect(() => {
    if (inputKey) {
      setSelected(new Set());
    }
  }, [inputKey]);
  const rows = gestures.data?.items ?? [];
  // Only rows on this page can be selected.
  const selectedIds = rows.flatMap((row) =>
    selected.has(row.id) ? [row.id] : []
  );
  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const stopEditing = useCallback(
    () => onEditingChange(false),
    [onEditingChange]
  );
  const { refetch } = gestures;
  const retry = useCallback(() => {
    refetch().catch((error: unknown) => {
      console.error("[admin] Failed to reload the gestures:", error);
    });
  }, [refetch]);
  let body: ReactNode;
  if (gestures.data) {
    body = (
      <div
        aria-busy={gestures.isPlaceholderData}
        className={
          gestures.isPlaceholderData
            ? "opacity-60 transition-opacity"
            : undefined
        }
      >
        <ListRows
          categories={categories.data ?? []}
          editing={editing}
          onSelectedChange={setSelected}
          onStopEditing={stopEditing}
          rows={rows}
          selected={selected}
        />
      </div>
    );
  } else if (gestures.isError) {
    body = <ErrorState level={2} onRetry={retry} />;
  } else {
    body = <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {gestures.data ? (
        <Stats counts={gestures.data.counts} />
      ) : (
        <Skeleton className="h-16 w-full sm:max-w-reading" />
      )}
      <Filters onSearchChange={onSearchChange} search={search} />
      {!editing && selectedIds.length > 0 ? (
        <BulkBar
          categories={categories.data ?? []}
          onClear={clearSelection}
          selected={selectedIds}
        />
      ) : null}
      {body}
      <Pager
        cursor={search.cursor}
        nextCursor={nextCursor}
        onSearchChange={onSearchChange}
        search={search}
      />
    </div>
  );
}
