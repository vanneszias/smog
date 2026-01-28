import { useMemo, useState } from "react";
import { type SearchableGesture, searchGestures } from "./gestureSearchRanking";

export interface GestureCardData {
  _id: string;
  name: string;
  playbackId: string;
  concept: string[];
  info: string;
  categories: Array<{ _id: string; name: string } | undefined>;
}

export interface UseGestureFilteringOptions {
  gestures: GestureCardData[] | undefined;
  initialSearchQuery?: string;
  initialCategories?: string[];
}

export function useGestureFiltering({
  gestures,
  initialSearchQuery = "",
  initialCategories = [],
}: UseGestureFilteringOptions) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategories, setSelectedCategories] =
    useState<string[]>(initialCategories);
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

    // Filter by categories first if any are selected
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((gesture) =>
        gesture.categories.some(
          (cat: { _id: string; name: string } | undefined) =>
            selectedCategories.includes(cat?.name || "")
        )
      );
    }

    // Apply search with relevance ranking if there's a query
    if (searchQuery && searchQuery.trim().length > 0) {
      // Use the new search algorithm with fuzzy matching and relevance ranking
      filtered = searchGestures(
        filtered as SearchableGesture[],
        searchQuery
      ) as GestureCardData[];
    }

    // Apply sorting if no search query (search results are already ranked by relevance)
    if (!searchQuery || searchQuery.trim().length === 0) {
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
    }

    return filtered;
  }, [gestures, searchQuery, selectedCategories, sortColumn, sortDirection]);

  const handleSort = (column: "name" | "category") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const clearFilters = () => {
    setSelectedCategories([]);
  };

  return {
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
  };
}
