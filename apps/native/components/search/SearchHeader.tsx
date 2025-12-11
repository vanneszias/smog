import { SPACING } from "@smog/styles";
import { t } from "i18next";
import { type StyleProp, View, type ViewStyle } from "react-native";
import CategoryListBottomSheet from "@/components/bottom-sheet/CategoryListBottomSheet";
import { CircularButton } from "@/components/common";
import CategoryFilters from "@/components/search/CategoryFilters";
import RecentSearches from "@/components/search/RecentSearches";
import SearchBar from "@/components/search/SearchBar";

type SearchHeaderMode = "home" | "search";

type SearchHeaderProps = {
  mode?: SearchHeaderMode;
  searchTerm: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: (query: string) => void;
  onClear: () => void;
  selectedCategories: string[];
  onCategoryChange: (categories: string[]) => void;
  onRemoveCategory?: (category: string) => void;
  categories: string[];
  onShowCategorySheet: () => void;
  onHideCategorySheet: () => void;
  categorySheetVisible: boolean;
  recentSearches: string[];
  onRecentSearchSelect: (query: string) => void;
  isLoading: boolean;
  isSearchBarFocused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  showFilterButton?: boolean;
  showSearchButton?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  searchBarContainerStyle?: StyleProp<ViewStyle>;
  rowGap?: number;
  placeholder?: string;
};

const SearchHeader: React.FC<SearchHeaderProps> = ({
  searchTerm,
  onSearchChange,
  onSearchSubmit,
  onClear,
  selectedCategories,
  onCategoryChange,
  categories,
  onShowCategorySheet,
  onHideCategorySheet,
  categorySheetVisible,
  onRecentSearchSelect,
  isLoading,
  isSearchBarFocused,
  onFocus,
  onBlur,
  showFilterButton = true,
  showSearchButton = true,
  containerStyle,
  searchBarContainerStyle,
  rowGap = SPACING.sm,
  placeholder = t("search.placeholder"),
  onRemoveCategory,
}) => {
  return (
    <View style={containerStyle}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          columnGap: rowGap,
        }}
      >
        {!!showFilterButton && (
          <CircularButton
            icon="filter"
            onPress={onShowCategorySheet}
            size="large"
          />
        )}
        <View style={[{ flex: 1 }, searchBarContainerStyle]}>
          <SearchBar
            isLoading={isLoading}
            onBlur={onBlur}
            onClear={onClear}
            onFocus={onFocus}
            onSearch={onSearchChange}
            onSubmit={onSearchSubmit}
            placeholder={placeholder}
            value={searchTerm}
          />
        </View>
        {!!showSearchButton && (
          <CircularButton
            icon="search"
            onPress={() => onSearchSubmit(searchTerm)}
            size="large"
          />
        )}
      </View>
      <RecentSearches
        onSelect={onRecentSearchSelect}
        searchTerm={searchTerm}
        visible={isSearchBarFocused}
      />
      {/* Category Filters Chips */}
      <CategoryFilters
        onRemoveCategory={
          onRemoveCategory ??
          (() => {
            /* noop */
          })
        }
        selectedCategories={selectedCategories}
      />
      {/* Category List Bottom Sheet */}
      <CategoryListBottomSheet
        categories={categories}
        onCategoryChange={
          onCategoryChange ??
          (() => {
            /* noop */
          })
        }
        onClose={onHideCategorySheet}
        selectedCategories={selectedCategories}
        visible={categorySheetVisible}
      />
    </View>
  );
};

export default SearchHeader;
