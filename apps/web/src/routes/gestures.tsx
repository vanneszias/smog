import type { GestureCardData } from "@smog/ui";
import { GestureList } from "@smog/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useFavorites } from "@/lib/favorites-context";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/gestures")({
  component: GesturesComponent,
});

function useGestureFiltering(gestures: GestureCardData[] | undefined) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<"name" | "category">("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const allCategories = useMemo(() => {
    if (!gestures) {
      return [];
    }
    const categorySet = new Set<string>();
    for (const gesture of gestures) {
      for (const cat of gesture.categories.filter(Boolean)) {
        if (cat) {
          categorySet.add(cat.name);
        }
      }
    }
    return Array.from(categorySet).sort();
  }, [gestures]);

  const filteredGestures = useMemo(() => {
    if (!gestures) {
      return [];
    }

    let filtered = gestures;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((gesture) => {
        const nameMatch = gesture.name.toLowerCase().includes(query);
        const conceptMatch = gesture.concept.some((c) =>
          c.toLowerCase().includes(query)
        );
        const infoMatch = gesture.info.toLowerCase().includes(query);
        return nameMatch || conceptMatch || infoMatch;
      });
    }

    if (categoryFilter) {
      filtered = filtered.filter((gesture) =>
        gesture.categories.some((cat) => cat?.name === categoryFilter)
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      if (sortColumn === "name") {
        const comparison = a.name.localeCompare(b.name);
        return sortDirection === "asc" ? comparison : -comparison;
      }
      const aCat = a.categories[0]?.name || "";
      const bCat = b.categories[0]?.name || "";
      const comparison = aCat.localeCompare(bCat);
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [gestures, searchQuery, categoryFilter, sortColumn, sortDirection]);

  const handleSort = (column: "name" | "category") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortColumn,
    sortDirection,
    handleSort,
    allCategories,
    filteredGestures,
  };
}

function SearchFilters({
  searchQuery,
  setSearchQuery,
  categoryFilter,
  setCategoryFilter,
  allCategories,
}: {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  allCategories: string[];
}) {
  return (
    <div className="border-b bg-background p-4">
      <div className="relative mb-3">
        <Search className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search gestures..."
          value={searchQuery}
        />
        {searchQuery ? (
          <button
            className="absolute top-2.5 right-3 text-muted-foreground hover:text-foreground"
            onClick={() => setSearchQuery("")}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="flex gap-2">
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(e) => setCategoryFilter(e.target.value)}
          value={categoryFilter}
        >
          <option value="">All Categories</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {categoryFilter ? (
          <button
            className="whitespace-nowrap rounded-md bg-secondary px-3 py-1 text-sm hover:bg-secondary/80"
            onClick={() => setCategoryFilter("")}
            type="button"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GesturesComponent() {
  const navigate = useNavigate();
  const { favoriteIds, toggleFavorite } = useFavorites();

  const gesturesQuery = useInfiniteQuery({
    queryKey: ["gestures", "list"],
    queryFn: async ({ pageParam }) => {
      const result = await client.gestures.list({
        cursor: pageParam ?? undefined,
        numItems: 50,
      });
      return result;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (lastPage.isDone) {
        return null;
      }
      return lastPage.continueCursor ?? null;
    },
  });

  // Automatically fetch next page until all gestures are loaded
  useEffect(() => {
    if (gesturesQuery.hasNextPage && !gesturesQuery.isFetchingNextPage) {
      gesturesQuery.fetchNextPage();
    }
  }, [
    gesturesQuery.hasNextPage,
    gesturesQuery.isFetchingNextPage,
    gesturesQuery,
  ]);

  // Flatten all pages into a single array
  const allGestures = useMemo(
    () => gesturesQuery.data?.pages.flatMap((page) => page.gestures) ?? [],
    [gesturesQuery.data?.pages]
  );

  const {
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    sortColumn,
    sortDirection,
    handleSort,
    allCategories,
    filteredGestures,
  } = useGestureFiltering(allGestures);

  const handleSelectGesture = (gestureId: string) => {
    navigate({ to: "/gestures/$id", params: { id: gestureId } });
  };

  const handleToggleFavorite = (gestureId: string) => {
    const gesture = allGestures.find((g) => g._id === gestureId);
    toggleFavorite(gestureId, gesture?.name);
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-background px-6 py-4">
        <h1 className="font-bold text-2xl" style={{ color: "var(--text)" }}>
          Gestures Library
        </h1>
        <p className="text-muted-foreground text-sm">
          Browse and learn sign language gestures
        </p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r">
          <SearchFilters
            allCategories={allCategories}
            categoryFilter={categoryFilter}
            searchQuery={searchQuery}
            setCategoryFilter={setCategoryFilter}
            setSearchQuery={setSearchQuery}
          />

          <div className="flex-1 overflow-auto">
            <GestureList
              error={gesturesQuery.error}
              favoriteGestureIds={favoriteIds}
              gestures={filteredGestures}
              isLoading={gesturesQuery.isLoading}
              onSelectGesture={handleSelectGesture}
              onSort={handleSort}
              onToggleFavorite={handleToggleFavorite}
              selectedGestureId={null}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
            />
          </div>
        </div>

        <div className="w-1/2 overflow-auto bg-muted/20">
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <p className="text-muted-foreground">
                Select a gesture to view details
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
