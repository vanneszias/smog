import { useTranslation } from "react-i18next";
import CategoryFilter from "../common/CategoryFilter";
import SearchBar from "../common/SearchBar";

type GestureFiltersProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  allCategories: string[];
  selectedCategories: string[];
  onCategoryToggle: (category: string) => void;
  filteredCount?: number;
  onClearFilters?: () => void;
  showResultCount?: boolean;
  searchPlaceholder?: string;
};

export function GestureFilters({
  searchQuery,
  onSearchChange,
  allCategories,
  selectedCategories,
  onCategoryToggle,
  filteredCount,
  onClearFilters,
  showResultCount = false,
  searchPlaceholder,
}: GestureFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 border-border border-b bg-background px-6 py-4">
      <SearchBar
        className="mb-3"
        onChange={onSearchChange}
        placeholder={
          searchPlaceholder || t("ui.gestureFilters.searchPlaceholder")
        }
        value={searchQuery}
      />
      <CategoryFilter
        categories={allCategories}
        onCategoryToggle={onCategoryToggle}
        selectedCategories={selectedCategories}
      />

      {showResultCount === true &&
      (searchQuery.length > 0 || selectedCategories.length > 0) &&
      filteredCount !== undefined ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("ui.gestureFilters.results", { count: filteredCount })}
          </span>
          {selectedCategories.length > 0 && onClearFilters ? (
            <button
              className="text-primary hover:underline"
              onClick={onClearFilters}
              type="button"
            >
              {t("ui.gestureFilters.clearFilters")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
