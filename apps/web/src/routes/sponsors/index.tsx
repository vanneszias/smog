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
    const sponsorshipStatus = gesture?.sponsorship?.status;

    // Prevent selection if gesture has active or any pending sponsorship
    if (
      sponsorshipStatus === "active" ||
      sponsorshipStatus === "pending" ||
      sponsorshipStatus === "pending_payment" ||
      sponsorshipStatus === "pending_approval"
    ) {
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
  sortColumn?: "name" | "category" | "sponsorship";
  sortDirection?: "asc" | "desc";
  onSort?: (column: "name" | "category" | "sponsorship") => void;
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

  const renderSortIndicator = (column: "name" | "category" | "sponsorship") => {
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

  const renderSponsorshipStatus = (
    gesture: (typeof gestures)[number],
    isSponsored: boolean,
    isPending: boolean,
    hasSponsorship: boolean
  ) => {
    if (isSponsored && hasSponsorship) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 font-medium text-green-800 text-xs">
              ✓ {t("web.sponsors.sponsored", "Sponsored")}
            </span>
          </div>
          {Boolean(gesture.sponsorship?.sponsorName) &&
            Boolean(gesture.sponsorship?.endDate) && (
              <div className="text-muted-foreground text-xs">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{gesture.sponsorship?.sponsorName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  <span>
                    {t("web.sponsors.availableAgainOn", "Available again:")}{" "}
                    {formatDate(gesture.sponsorship!.endDate)}
                  </span>
                </div>
              </div>
            )}
        </div>
      );
    }

    if (isPending && hasSponsorship) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
              ⏳ {t("web.sponsors.pendingApproval", "Pending Approval")}
            </span>
          </div>
          {Boolean(gesture.sponsorship?.sponsorName) && (
            <div className="text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span>{gesture.sponsorship?.sponsorName}</span>
              </div>
              <p className="mt-1">
                {t(
                  "web.sponsors.pendingDescription",
                  "This sponsorship is awaiting approval"
                )}
              </p>
            </div>
          )}
        </div>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-800 text-xs">
        {t("web.sponsors.available", "Available to sponsor")}
      </span>
    );
  };

  const handleNameClick = onSort ? () => onSort("name") : undefined;
  const handleCategoryClick = onSort ? () => onSort("category") : undefined;
  const handleSponsorshipClick = onSort
    ? () => onSort("sponsorship")
    : undefined;

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
                {t("ui.gestureList.category")}
                {renderSortIndicator("category")}
              </div>
            </th>
            <th className="h-12 px-4 text-left align-middle font-medium">
              {t("ui.gestureList.concepts")}
            </th>
            <th
              className={`h-12 px-4 text-left align-middle font-medium ${sortableClass}`}
              onClick={handleSponsorshipClick}
            >
              <div className="flex items-center gap-1">
                {t("web.sponsors.sponsorshipStatus", "Sponsorship Status")}
                {renderSortIndicator("sponsorship")}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {gestures.map((gesture) => {
            const isSelected = selectedGestureIds.includes(gesture._id);
            const sponsorshipStatus = gesture.sponsorship?.status;
            const isSponsored = sponsorshipStatus === "active";
            const isPending =
              sponsorshipStatus === "pending" ||
              sponsorshipStatus === "pending_payment" ||
              sponsorshipStatus === "pending_approval";
            const isUnavailable = isSponsored || isPending;
            const hasSponsorship = Boolean(gesture.sponsorship);

            return (
              <tr
                className={`border-b transition-colors ${
                  isUnavailable
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-muted/50"
                } ${isSelected ? "bg-primary/10" : ""}`}
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
                  {renderSponsorshipStatus(
                    gesture,
                    isSponsored,
                    isPending,
                    hasSponsorship
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
    sortDirection: baseSortDirection,
    handleSort: baseHandleSort,
    allCategories,
    filteredGestures,
  } = useGestureFiltering({
    gestures: gesturesWithCategories,
    initialSearchQuery: searchParams.q || "",
    initialCategories: searchParams.category
      ? searchParams.category.split(",")
      : [],
  });

  // Extended sorting to support sponsorship column
  const [sponsorSortColumn, setSponsorSortColumn] = useState<
    "name" | "category" | "sponsorship"
  >("name");
  const [sponsorSortDirection, setSponsorSortDirection] = useState<
    "asc" | "desc"
  >("asc");

  const handleSponsorSort = (column: "name" | "category" | "sponsorship") => {
    if (column === "sponsorship") {
      // Handle sponsorship sorting separately
      if (sponsorSortColumn === column) {
        setSponsorSortDirection(
          sponsorSortDirection === "asc" ? "desc" : "asc"
        );
      } else {
        setSponsorSortColumn(column);
        setSponsorSortDirection("asc");
      }
    } else {
      // Use base sorting for name and category
      setSponsorSortColumn(column);
      setSponsorSortDirection(baseSortDirection);
      baseHandleSort(column);
    }
  };

  // Apply sponsorship sorting if needed
  const sortedGestures = useMemo(() => {
    if (sponsorSortColumn === "sponsorship") {
      return [...filteredGestures].sort((a, b) => {
        const aSponsored = a.sponsorship?.status === "active" ? 1 : 0;
        const bSponsored = b.sponsorship?.status === "active" ? 1 : 0;
        const comparison = aSponsored - bSponsored;
        return sponsorSortDirection === "asc" ? comparison : -comparison;
      });
    }
    return filteredGestures;
  }, [filteredGestures, sponsorSortColumn, sponsorSortDirection]);

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
      sortedGestures.map((g) => {
        const gestureWithSponsorship = gesturesWithSponsorship?.find(
          (gs) => gs._id === g._id
        );
        return {
          ...g,
          sponsorship: gestureWithSponsorship?.sponsorship,
          _isSelected: selectedGestureIds.includes(g._id),
        };
      }),
    [sortedGestures, gesturesWithSponsorship, selectedGestureIds]
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
            <div className="mt-6 space-y-3 rounded-lg border-2 border-primary bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <span className="font-bold text-lg">
                      {selectedGestureIds.length}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold text-lg">
                      {t(
                        "web.sponsors.selectedForSponsoring",
                        "Selected for Sponsoring"
                      )}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {selectedGestureIds.length === 1
                        ? t(
                            "web.sponsors.gestureSelected",
                            "1 gesture selected"
                          )
                        : t(
                            "web.sponsors.gesturesSelected",
                            `${selectedGestureIds.length} gestures selected`
                          )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button onClick={handleContinue} size="lg">
                    <Upload className="mr-2 h-4 w-4" />
                    {t("web.sponsors.continue", "Continue to Upload")}
                  </Button>
                  <Button onClick={clearSelection} size="lg" variant="outline">
                    {t("web.sponsors.clearSelection", "Clear Selection")}
                  </Button>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="mb-2 font-semibold text-sm">
                  {t("web.sponsors.selectedGestures", "Selected Gestures:")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedGestureIds.map((id) => {
                    const gesture = gesturesWithSponsorship?.find(
                      (g) => g._id === id
                    );
                    return (
                      <div
                        key={id}
                        className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-1.5 font-medium text-sm shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span>{gesture?.name || id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
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
            onSort={handleSponsorSort}
            selectedGestureIds={selectedGestureIds}
            sortColumn={sponsorSortColumn}
            sortDirection={sponsorSortDirection}
          />
        )}
      </div>
    </div>
  );
}
