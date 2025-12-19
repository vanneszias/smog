import { api } from "@smog/convex";
import { useGestureFiltering } from "@smog/hooks";
import { GestureFilters } from "@smog/ui";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useQuery as useConvexQuery } from "convex/react";
import { Sparkles, Upload, User } from "lucide-react";
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

  // Fetch all categories using Convex
  const allCategories = useConvexQuery(api.categories.list) || [];

  const gesturesWithCategories = useMemo(() => {
    if (!gesturesWithSponsorship) {
      return [];
    }

    return gesturesWithSponsorship.map((gesture) => ({
      ...gesture,
      categories: gesture.categoryIds
        .map((catId) => allCategories.find((cat) => cat._id === catId))
        .filter((cat): cat is NonNullable<typeof cat> => Boolean(cat)),
    }));
  }, [gesturesWithSponsorship, allCategories]);

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

// Custom gesture list component with sponsorship information
function SponsorGestureList({
  gestures,
  isLoading,
  error,
  selectedGestureIds,
  onSelectGesture,
  sortColumn,
  sortDirection,
  onSort,
}: {
  gestures: Array<{
    _id: string;
    name: string;
    categories: Array<{ _id: string; name: string }>;
    concept: string[];
    sponsorship?: {
      status: string;
      sponsorName: string;
      endDate: number;
    } | null;
    _isSelected?: boolean;
  }>;
  isLoading: boolean;
  error?: Error | null;
  selectedGestureIds: string[];
  onSelectGesture: (gestureId: string) => void;
  sortColumn?: "name" | "category";
  sortDirection?: "asc" | "desc";
  onSort?: (column: "name" | "category") => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="font-semibold text-red-600">
            {t("ui.gestureList.errorLoading")}
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            {t("ui.gestureList.errorTryAgain")}
          </p>
        </div>
      </div>
    );
  }

  if (gestures.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          {t("ui.gestureList.noGestures")}
        </p>
      </div>
    );
  }

  const sortableClass = onSort
    ? "cursor-pointer select-none hover:bg-muted/50"
    : "";

  const renderSortIndicator = (column: "name" | "category") => {
    if (!onSort || sortColumn !== column) {
      return null;
    }
    return (
      <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
    );
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const handleNameClick = onSort ? () => onSort("name") : undefined;
  const handleCategoryClick = onSort ? () => onSort("category") : undefined;

  return (
    <div className="relative h-full w-full overflow-auto px-4">
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b">
            <th
              className={`h-12 px-4 text-left align-middle font-medium ${sortableClass}`}
              onClick={handleNameClick}
            >
              <div className="flex items-center gap-1">
                {t("ui.gestureList.name")}
                {renderSortIndicator("name")}
              </div>
            </th>
            <th
              className={`h-12 px-4 text-left align-middle font-medium ${sortableClass}`}
              onClick={handleCategoryClick}
            >
              <div className="flex items-center gap-1">
                {t("ui.gestureList.name")}
                {renderSortIndicator("name")}
              </div>
            </th>
            <th
              className={`h-12 px-4 text-left align-middle font-medium ${sortableClass}`}
              onClick={handleCategoryClick}
            >
              <div className="flex items-center gap-1">
                {t("ui.gestureList.category")}
                {renderSortIndicator("category")}
              </div>
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              {t("ui.gestureList.concepts")}
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              {t("web.sponsors.sponsorshipStatus", "Sponsorship Status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {gestures.map((gesture) => {
            const isSelected = selectedGestureIds.includes(gesture._id);
            const isSponsored = gesture.sponsorship?.status === "active";
            const hasSponsorship =
              Boolean(isSponsored) && Boolean(gesture.sponsorship);

            return (
              <tr
                className={`cursor-pointer border-b transition-colors hover:bg-muted/50 ${
                  isSelected ? "bg-primary/10" : ""
                } ${isSponsored ? "opacity-60" : ""}`}
                key={gesture._id}
                onClick={() => onSelectGesture(gesture._id)}
              >
                <td className="p-4 font-medium">{gesture.name}</td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {gesture.categories
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((cat) => (
                        <span
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs"
                          key={cat._id}
                        >
                          {cat.name}
                        </span>
                      ))}
                    {gesture.categories.length > 2 && (
                      <span className="text-muted-foreground text-xs">
                        +{gesture.categories.length - 2}
                      </span>
                    )}
                  </div>
                </td>
                <td className="max-w-xs truncate p-4 text-muted-foreground text-sm">
                  {gesture.concept.join(", ")}
                </td>
                <td className="p-4">
                  {hasSponsorship ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 font-medium text-green-800 text-xs">
                          ✓ {t("web.sponsors.sponsored", "Sponsored")}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{gesture.sponsorship!.sponsorName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          <span>
                            {t(
                              "web.sponsors.availableAgainOn",
                              "Available again:"
                            )}{" "}
                            {formatDate(gesture.sponsorship!.endDate)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800 text-xs">
                      {t("web.sponsors.available", "Available to sponsor")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
          <SponsorGestureList
            error={error}
            gestures={enhancedGestures}
            isLoading={isLoading}
            onSelectGesture={handleSelectGesture}
            onSort={handleSort}
            selectedGestureIds={selectedGestureIds}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
          />
        )}
      </div>
    </div>
  );
}
