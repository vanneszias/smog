import { CategoryFilter, SearchBar } from "@smog/ui";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EnhancedGestureDetail } from "@/components/test-gestures/EnhancedGestureDetail";
import { EnhancedGestureList } from "@/components/test-gestures/EnhancedGestureList";
import { LayoutDebugTools } from "@/components/test-gestures/LayoutDebugTools";
import {
  filterGestures,
  MOCK_CATEGORIES,
  MOCK_GESTURES,
} from "@/components/test-gestures/mock-data";

export const Route = createFileRoute("/test-gestures")({
  component: TestGesturesPage,
});

function TestGesturesPage() {
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(
    "gesture-1"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Filter gestures based on search and categories
  const filteredGestures = useMemo(() => {
    return filterGestures(MOCK_GESTURES, searchQuery, selectedCategories);
  }, [searchQuery, selectedCategories]);

  const selectedGesture = useMemo(() => {
    return MOCK_GESTURES.find((g) => g._id === selectedGestureId);
  }, [selectedGestureId]);

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleToggleFavorite = (gestureId: string) => {
    setFavoriteIds((prev) =>
      prev.includes(gestureId)
        ? prev.filter((id) => id !== gestureId)
        : [...prev, gestureId]
    );
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
  };

  const handleToggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Debug Tools */}
      <LayoutDebugTools
        isDarkMode={isDarkMode}
        onToggleDarkMode={handleToggleDarkMode}
      />

      {/* Page Header */}
      <div className="shrink-0 border-border border-b bg-background px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between">
          <div>
            <h1 className="font-bold text-2xl" style={{ color: "var(--text)" }}>
              Gesture UI Test
            </h1>
            <p className="text-muted-foreground text-sm">
              Testing improved UX for tablets with Picture-in-Picture
            </p>
          </div>
          <a
            className="rounded-lg bg-primary px-4 py-2 font-medium text-sm text-white transition-all hover:bg-primary/90"
            href="/gestures"
          >
            View Current Implementation
          </a>
        </div>
      </div>

      {/* Main Content: Smart Split Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* List Panel - Responsive width */}
        <div
          className={`flex min-h-0 flex-col overflow-hidden border-border border-r bg-background ${
            selectedGesture ? "hidden lg:flex lg:w-[35%] xl:w-[40%]" : "flex-1"
          }`}
        >
          {/* Filters */}
          <div className="shrink-0 border-border border-b px-4 py-4">
            <div className="mb-3">
              <SearchBar
                onChange={setSearchQuery}
                onClear={() => {
                  setSearchQuery("");
                }}
                placeholder="Search gestures..."
                value={searchQuery}
              />
            </div>

            {/* Category Filters */}
            <CategoryFilter
              categories={MOCK_CATEGORIES.map((c) => c.name)}
              onCategoryToggle={(categoryName) => {
                const category = MOCK_CATEGORIES.find(
                  (c) => c.name === categoryName
                );
                if (category) {
                  handleCategoryToggle(category._id);
                }
              }}
              selectedCategories={MOCK_CATEGORIES.filter((c) =>
                selectedCategories.includes(c._id)
              ).map((c) => c.name)}
            />

            {/* Clear Filters */}
            {(searchQuery || selectedCategories.length > 0) && (
              <button
                className="mt-3 text-primary text-sm transition-colors hover:text-primary/80"
                onClick={handleClearFilters}
                type="button"
              >
                Clear all filters
              </button>
            )}
          </div>

          {/* Gesture List */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <EnhancedGestureList
              favoriteGestureIds={favoriteIds}
              gestures={filteredGestures}
              onSelectGesture={setSelectedGestureId}
              onToggleFavorite={handleToggleFavorite}
              selectedGestureId={selectedGestureId}
            />
          </div>
        </div>

        {/* Detail Panel - Responsive width */}
        <div
          className={`min-h-0 overflow-hidden bg-muted/20 ${
            selectedGesture
              ? "flex-1 lg:w-[65%] xl:w-[60%]"
              : "hidden lg:flex lg:w-[65%] xl:w-[60%]"
          }`}
        >
          {selectedGesture ? (
            <EnhancedGestureDetail
              gesture={selectedGesture}
              isFavorite={favoriteIds.includes(selectedGesture._id)}
              onBack={() => {
                setSelectedGestureId(null);
              }}
              onToggleFavorite={handleToggleFavorite}
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
