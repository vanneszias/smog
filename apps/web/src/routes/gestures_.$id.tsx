import { useGestureFiltering } from "@smog/hooks";
import {
  GestureDetail,
  GestureDetailSkeleton,
  GestureFilters,
  GestureList,
} from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGestures } from "@/hooks/useGestures";
import {
  trackFavoriteAdded,
  trackFavoriteRemoved,
  trackGestureViewed,
} from "@/lib/analytics";
import { useFavorites } from "@/lib/favorites-context";
import { isMobileDevice, openInApp } from "@/utils/deviceDetection";

export const Route = createFileRoute("/gestures_/$id")({
  component: GesturesComponent,
});

function GesturesComponent() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, favoriteIds } = useFavorites();

  // Detect mobile immediately (not in useEffect) to avoid hydration issues
  const [showOpenInApp, setShowOpenInApp] = useState(() => {
    // This will be false on server, true on client if mobile
    if (typeof window === "undefined") {
      return false;
    }
    return isMobileDevice();
  });

  // Re-check on mount to handle SSR
  useEffect(() => {
    const isMobile = isMobileDevice();
    console.log("Setting showOpenInApp to:", isMobile);
    setShowOpenInApp(isMobile);
  }, []);

  // Use shared gestures hook
  const { gestures: allGestures, isLoading, error } = useGestures();

  const {
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle,
    sortColumn,
    sortDirection,
    handleSort,
    allCategories,
    filteredGestures,
  } = useGestureFiltering({
    gestures: allGestures,
  });

  const selectedGesture = useMemo(() => {
    if (!id) {
      return null;
    }
    return allGestures.find((g) => g._id === id);
  }, [id, allGestures]);

  useEffect(() => {
    if (selectedGesture) {
      const categories: string[] = (selectedGesture.categories || [])
        .filter((c): c is Exclude<typeof c, null | undefined> => Boolean(c))
        .map((c) => (typeof c === "string" ? c : c.name));
      trackGestureViewed(
        selectedGesture._id,
        selectedGesture.name,
        categories,
        "search_results"
      );
    }
  }, [selectedGesture]);

  const showSkeleton = isLoading && !!id;

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleDeselectGesture = () => {
    navigate({ to: "/gestures" });
  };

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = allGestures.find((g) => g._id === gestureId);
    const isFav = isFavorite(gestureId);
    const categories: string[] = (gesture?.categories || [])
      .filter((c): c is Exclude<typeof c, null | undefined> => Boolean(c))
      .map((c) => (typeof c === "string" ? c : c.name));
    if (isFav) {
      trackFavoriteRemoved(gestureId, gesture?.name || "", categories);
    } else {
      trackFavoriteAdded(gestureId, gesture?.name || "", categories);
    }
    toggleFavorite(gestureId, gesture?.name);
  };

  const handleOpenInApp = useCallback(() => {
    if (id) {
      openInApp(`/gestures/${id}`);
    }
  }, [id]);

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* List Panel - hidden on mobile when gesture is selected */}
        <div
          className={`flex min-h-0 flex-col border-r ${selectedGesture ? "hidden lg:flex lg:w-1/2" : "flex-1"}`}
        >
          {/* Search and Filters */}
          <GestureFilters
            allCategories={allCategories}
            onCategoryToggle={handleCategoryToggle}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("web.gestures.searchPlaceholder")}
            searchQuery={searchQuery}
            selectedCategories={selectedCategories}
          />

          {/* Gesture List */}
          <div className="min-h-0 flex-1 overflow-auto">
            <GestureList
              error={error}
              favoriteGestureIds={favoriteIds}
              gestures={filteredGestures}
              isLoading={isLoading}
              onSelectGesture={handleSelectGesture}
              onSort={handleSort}
              onToggleFavorite={handleToggleFavorite}
              selectedGestureId={id}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
            />
          </div>
        </div>

        {/* Detail Panel - Full width on mobile, half on desktop */}
        <div
          className={`overflow-hidden bg-muted/20 ${selectedGesture ? "flex-1 lg:w-1/2" : "hidden lg:flex lg:w-1/2"}`}
        >
          {showSkeleton ? (
            <GestureDetailSkeleton />
          ) : selectedGesture ? (
            <GestureDetail
              gesture={selectedGesture}
              isFavorite={isFavorite(selectedGesture._id)}
              onBack={handleDeselectGesture}
              onOpenInApp={handleOpenInApp}
              onToggleFavorite={() =>
                toggleFavorite(selectedGesture._id, selectedGesture.name)
              }
              showOpenInApp={showOpenInApp}
            />
          ) : id ? (
            <GestureDetailSkeleton />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <p className="text-muted-foreground">
                  {t("web.gestures.selectGesture")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
