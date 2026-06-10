import { useGestureFiltering } from "@smog/hooks";
import { GestureFilters, GestureList } from "@smog/ui";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import EmptyState from "@/components/EmptyState";
import { useGestures } from "@/hooks/useGestures";
import {
  trackSearchCategoryAdded,
  trackSearchCategoryRemoved,
  trackSearchPerformed,
} from "@/lib/analytics";
import { useLists } from "@/lib/lists-context";

interface GestureSearch {
  q?: string;
  category?: string;
}

export const Route = createFileRoute("/gestures")({
  component: GesturesComponent,
  validateSearch: (search: Record<string, unknown>): GestureSearch => ({
    q: (search.q as string) || "",
    category: (search.category as string) || "",
  }),
});

function GesturesComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/gestures" });
  const { openSaveGestureDialog, savedGestureIds } = useLists();
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(
    null
  );

  // Use shared gestures hook
  const { gestures: allGestures, isLoading, error } = useGestures();

  const {
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle: baseHandleCategoryToggle,
    clearFilters,
    sortColumn,
    sortDirection,
    handleSort,
    allCategories,
    filteredGestures,
  } = useGestureFiltering({
    gestures: allGestures,
    initialSearchQuery: searchParams.q || "",
    initialCategories: searchParams.category
      ? searchParams.category.split(",")
      : [],
  });

  const handleCategoryToggle = (category: string) => {
    if (selectedCategories.includes(category)) {
      trackSearchCategoryRemoved(category, selectedCategories.length - 1);
    } else {
      trackSearchCategoryAdded(category, selectedCategories.length + 1);
    }
    baseHandleCategoryToggle(category);
  };

  // Track search when query changes
  useEffect(() => {
    const startTime = performance.now();
    const timer = setTimeout(() => {
      trackSearchPerformed(
        searchQuery,
        selectedCategories,
        filteredGestures.length,
        performance.now() - startTime
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategories, filteredGestures.length]);

  // Sync URL with search query changes
  useEffect(() => {
    navigate({
      to: "/gestures",
      search: {
        ...(searchQuery ? { q: searchQuery } : {}),
        ...(selectedCategories.length > 0
          ? { category: selectedCategories.join(",") }
          : {}),
      },
      replace: true,
    });
  }, [searchQuery, selectedCategories, navigate]);

  const handleSelectGesture = (gestureId: string) => {
    setSelectedGestureId(gestureId);
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleToggleSaved = (gestureId: string) => {
    const gesture = allGestures.find((g) => g._id === gestureId);
    openSaveGestureDialog({
      categories: (gesture?.categories ?? [])
        .filter(
          (category): category is Exclude<typeof category, null | undefined> =>
            Boolean(category)
        )
        .map((category) => category.name),
      gestureId,
      gestureName: gesture?.name,
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Search and Filter Section */}
      <div className="shrink-0">
        <GestureFilters
          allCategories={allCategories}
          onCategoryToggle={handleCategoryToggle}
          onClearFilters={clearFilters}
          onSearchChange={setSearchQuery}
          searchPlaceholder={t("web.gestures.searchPlaceholder")}
          searchQuery={searchQuery}
          selectedCategories={selectedCategories}
        />
      </div>

      {/* Content Section */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredGestures.length === 0 ? (
          <EmptyState
            message={
              searchQuery || selectedCategories.length > 0
                ? t("web.gestures.noResultsWithFilters")
                : t("web.gestures.noResults")
            }
          />
        ) : (
          <GestureList
            error={error}
            gestures={filteredGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onSort={handleSort}
            onToggleSaved={handleToggleSaved}
            savedGestureIds={savedGestureIds}
            selectedGestureId={selectedGestureId}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
          />
        )}
      </div>
    </div>
  );
}
