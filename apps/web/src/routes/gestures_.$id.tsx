import { useGestureFiltering } from "@smog/hooks";
import { GestureDetail, GestureFilters, GestureList } from "@smog/ui";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useGestures } from "@/hooks/useGestures";
import { useFavorites } from "@/lib/favorites-context";

export const Route = createFileRoute("/gestures_/$id")({
  component: GesturesComponent,
});

function GesturesComponent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite, favoriteIds } = useFavorites();

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

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleDeselectGesture = () => {
    navigate({ to: "/gestures" });
  };

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = allGestures.find((g) => g._id === gestureId);
    toggleFavorite(gestureId, gesture?.name);
  };

  return (
    <div className="flex h-full max-h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-border border-b bg-background px-6 py-4">
        <h1 className="font-bold text-2xl" style={{ color: "var(--text)" }}>
          Gestures Library
        </h1>
        <p className="text-muted-foreground text-sm">
          Browse and learn sign language gestures
        </p>
      </div>

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
            searchPlaceholder="Search gestures..."
            searchQuery={searchQuery}
            selectedCategories={selectedCategories}
          />

          {/* Gesture List */}
          <div className="min-h-0 flex-1">
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
          className={`overflow-auto bg-muted/20 ${selectedGesture ? "flex-1 lg:w-1/2" : "hidden lg:flex lg:w-1/2"}`}
        >
          {selectedGesture ? (
            <GestureDetail
              gesture={selectedGesture}
              isFavorite={isFavorite(selectedGesture._id)}
              onBack={handleDeselectGesture}
              onToggleFavorite={() =>
                toggleFavorite(selectedGesture._id, selectedGesture.name)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <p className="text-muted-foreground">
                  Select a gesture to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
