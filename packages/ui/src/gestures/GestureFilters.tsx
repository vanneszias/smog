import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import CategoryFilter from "../common/CategoryFilter";
import SearchBar from "../common/SearchBar";

interface GestureFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  allCategories: string[];
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
  onClearFilters?: () => void;
  searchPlaceholder?: string;
}

export function GestureFilters({
  searchQuery,
  onSearchChange,
  allCategories,
  selectedCategories,
  onCategoryToggle,
  onClearFilters,
  searchPlaceholder,
}: GestureFiltersProps) {
  const { t } = useTranslation();
  // Default to collapsed on mobile (< 768px)
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 768;
    }
    return true;
  });
  const activeFilterCount = selectedCategories.length;

  return (
    <div className="shrink-0 border-border border-b bg-background px-4 py-4 lg:px-12">
      <div className="mb-3 flex items-center gap-2">
        <SearchBar
          className="flex-1"
          onChange={onSearchChange}
          placeholder={
            searchPlaceholder || t("ui.gestureFilters.searchPlaceholder")
          }
          value={searchQuery}
        />
        <button
          className="flex items-center gap-1.5 rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          {t("ui.gestureFilters.filters")}
          {activeFilterCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-semibold text-primary-foreground text-xs">
              {activeFilterCount}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
      </div>

      {isExpanded && (
        <CategoryFilter
          categories={allCategories}
          onCategoryToggle={onCategoryToggle}
          selectedCategories={selectedCategories}
        />
      )}

      {selectedCategories.length > 0 && onClearFilters ? (
        <div className="mt-4">
          <button
            className="text-primary text-sm hover:underline"
            onClick={onClearFilters}
            type="button"
          >
            {t("ui.gestureFilters.clearFilters")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
