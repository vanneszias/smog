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
import { useFavorites } from "@/lib/favorites-context";

type GestureSearch = {
  q?: string;
  category?: string;
};

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
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(
    null
  );

  // Use shared gestures hook
  const { gestures: allGestures, isLoading, error } = useGestures();

  const {
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle,
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

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = allGestures.find((g) => g._id === gestureId);
    toggleFavorite(gestureId, gesture?.name);
  };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      {/* Search and Filter Section */}
      <GestureFilters
        allCategories={allCategories}
        filteredCount={filteredGestures.length}
        onCategoryToggle={handleCategoryToggle}
        onClearFilters={clearFilters}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t("web.gestures.searchPlaceholder")}
        searchQuery={searchQuery}
        selectedCategories={selectedCategories}
        showResultCount={true}
      />

      {/* Content Section */}
      <div className="min-h-0 flex-1">
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
            favoriteGestureIds={favoriteIds}
            gestures={filteredGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onSort={handleSort}
            onToggleFavorite={handleToggleFavorite}
            selectedGestureId={selectedGestureId}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
          />
        )}
      </div>
    </div>
  );
}
