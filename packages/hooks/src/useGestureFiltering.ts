import type { GestureCardData } from "@smog/ui";
import { useMemo, useState } from "react";

export type UseGestureFilteringOptions = {
  gestures: GestureCardData[] | undefined;
  initialSearchQuery?: string;
  initialCategories?: string[];
};

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

    if (selectedCategories.length > 0) {
      filtered = filtered.filter((gesture) =>
        gesture.categories.some((cat) =>
          selectedCategories.includes(cat?.name || "")
        )
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
