import { useGestureFiltering } from "@smog/hooks";
import { GestureFilters, GestureList } from "@smog/ui";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { Sparkles, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";

type SponsorSearch = {
  q?: string;
  category?: string;
};

export const Route = createFileRoute("/sponsors/")({
  component: SponsorsComponent,
  validateSearch: (search: Record<string, unknown>): SponsorSearch => ({
    q: (search.q as string) || "",
    category: (search.category as string) || "",
  }),
});

function useSponsorsData() {
  const {
    data: gesturesWithSponsorship,
    isLoading,
    error,
  } = useQuery(orpc.sponsorships.listGesturesWithSponsorship.queryOptions());

  const gesturesWithCategories = useMemo(() => {
    if (!gesturesWithSponsorship) {
      return [];
    }

    return gesturesWithSponsorship.map((gesture) => ({
      ...gesture,
      categories: gesture.categoryIds.map(() => ({
        _id: "",
        name: "",
      })),
    }));
  }, [gesturesWithSponsorship]);

  return {
    gesturesWithSponsorship,
    gesturesWithCategories,
    isLoading,
    error,
  };
}

function useGestureSelection(
  gesturesWithSponsorship: Array<{
    _id: string;
    sponsorship?: { status: string };
  }>
) {
  const [selectedGestureIds, setSelectedGestureIds] = useState<string[]>([]);

  const handleSelectGesture = (gestureId: string) => {
    const gesture = gesturesWithSponsorship?.find((g) => g._id === gestureId);
    if (gesture?.sponsorship?.status === "active") {
      return;
    }

    setSelectedGestureIds((prev) =>
      prev.includes(gestureId)
        ? prev.filter((id) => id !== gestureId)
        : [...prev, gestureId]
    );
  };

  const clearSelection = () => setSelectedGestureIds([]);

  return { selectedGestureIds, handleSelectGesture, clearSelection };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex UI logic with multiple conditional renders
function SponsorsComponent() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/sponsors/" });

  const { gesturesWithSponsorship, gesturesWithCategories, isLoading, error } =
    useSponsorsData();
  const { selectedGestureIds, handleSelectGesture, clearSelection } =
    useGestureSelection(gesturesWithSponsorship || []);

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
    gestures: gesturesWithCategories,
    initialSearchQuery: searchParams.q || "",
    initialCategories: searchParams.category
      ? searchParams.category.split(",")
      : [],
  });

  useEffect(() => {
    navigate({
      to: "/sponsors/",
      search: {
        ...(searchQuery ? { q: searchQuery } : {}),
        ...(selectedCategories.length > 0
          ? { category: selectedCategories.join(",") }
          : {}),
      },
      replace: true,
    });
  }, [searchQuery, selectedCategories, navigate]);

  const handleContinue = () => {
    if (selectedGestureIds.length > 0) {
      navigate({
        to: "/sponsors/create",
        search: { gestureIds: selectedGestureIds.join(",") },
      });
    }
  };

  const enhancedGestures = useMemo(
    () =>
      filteredGestures.map((g) => {
        const gestureWithSponsorship = gesturesWithSponsorship?.find(
          (gs) => gs._id === g._id
        );
        return {
          ...g,
          sponsorship: gestureWithSponsorship?.sponsorship,
          _isSelected: selectedGestureIds.includes(g._id),
        };
      }),
    [filteredGestures, gesturesWithSponsorship, selectedGestureIds]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b bg-background px-6 py-6">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-8 w-8 text-primary" />
            <h1 className="font-bold text-3xl">
              {t("web.sponsors.title", "Sponsor Gestures")}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {t(
              "web.sponsors.description",
              "Select one or more gestures to sponsor. Each video will have your custom outro with branding and message."
            )}
          </p>

          {selectedGestureIds.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 px-4 py-2">
                <span className="font-medium">
                  {selectedGestureIds.length}{" "}
                  {selectedGestureIds.length === 1
                    ? t("web.sponsors.gestureSelected", "gesture selected")
                    : t("web.sponsors.gesturesSelected", "gestures selected")}
                </span>
              </div>
              <Button onClick={handleContinue} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                {t("web.sponsors.continue", "Continue to Upload")}
              </Button>
              <Button onClick={clearSelection} size="lg" variant="outline">
                {t("web.sponsors.clearSelection", "Clear Selection")}
              </Button>
            </div>
          )}
        </div>
      </div>

      <GestureFilters
        allCategories={allCategories}
        filteredCount={filteredGestures.length}
        onCategoryToggle={handleCategoryToggle}
        onClearFilters={clearFilters}
        onSearchChange={setSearchQuery}
        searchPlaceholder={t(
          "web.sponsors.searchPlaceholder",
          "Search gestures to sponsor..."
        )}
        searchQuery={searchQuery}
        selectedCategories={selectedCategories}
        showResultCount={true}
      />

      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : filteredGestures.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <Sparkles className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h2 className="mb-2 font-bold text-xl">
                {searchQuery || selectedCategories.length > 0
                  ? t("web.sponsors.noResultsWithFilters", "No gestures found")
                  : t("web.sponsors.noGestures", "No gestures available")}
              </h2>
              <p className="text-muted-foreground">
                {searchQuery || selectedCategories.length > 0
                  ? t(
                      "web.sponsors.tryDifferentFilters",
                      "Try adjusting your search or filters"
                    )
                  : t(
                      "web.sponsors.noGesturesDescription",
                      "Check back later for available gestures to sponsor."
                    )}
              </p>
            </div>
          </div>
        ) : (
          <GestureList
            error={error}
            gestures={enhancedGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onSort={handleSort}
            selectedGestureId={
              selectedGestureIds.length === 1 ? selectedGestureIds[0] : null
            }
            sortColumn={sortColumn}
            sortDirection={sortDirection}
          />
        )}
      </div>
    </div>
  );
}
