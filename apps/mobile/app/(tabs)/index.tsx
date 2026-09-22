import {
  Button,
  CategoryFilter,
  GestureCard,
  GestureGrid,
  type GestureSummary,
  Sheet,
  Text,
} from "@smog/ui-native";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useCategories, useGestures } from "@/data/gestures";

/**
 * One message for any failed page, first or later — the request carries no
 * information a visitor could act on differently, and `endpoints/mobile.ts`
 * answers every failure the same way.
 */
const LOAD_ERROR = "Er ging iets mis bij het laden van de gebaren.";
const RETRY_LABEL = "Probeer opnieuw";

/**
 * The Gestures tab: browse, filter by category, and scroll for more.
 *
 * **A failed request and an empty result are different screens.** `error`
 * renders the retry control; an empty, error-free page renders
 * `GestureGrid`'s own built-in empty state instead — see that component's
 * own comment on why `loading` and an empty array are not the same thing
 * either. Collapsing either pair back into one branch is exactly the
 * mutation `task-10-report.md` records trying and catching.
 *
 * Pagination is driven by `data.page` — the page the server actually
 * answered, after its own clamp — rather than the `page` this screen asked
 * for, so a fetch that lands on a clamped page still appends (or replaces)
 * correctly without this screen re-deriving the clamp itself.
 */
export default function GesturesScreen() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<GestureSummary[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data, error, loading, refetch } = useGestures({
    category: selectedCategory,
    page,
  });
  const { data: categories } = useCategories();

  useEffect(() => {
    if (data === null) {
      return;
    }

    setItems((previous) =>
      data.page === 1 ? data.docs : [...previous, ...data.docs]
    );
  }, [data]);

  const handleCategoryChange = (id: string | null) => {
    setSelectedCategory(id);
    setPage(1);
    setItems([]);
    setFilterOpen(false);
  };

  const handleEndReached = () => {
    if (data !== null && !loading && page < data.totalPages) {
      setPage((current) => current + 1);
    }
  };

  return (
    <View className="flex-1 gap-md bg-background p-lg">
      <View className="flex-row items-center justify-between">
        <Text size="xl" variant="heading">
          Gebaren
        </Text>
        <Button
          onPress={() => setFilterOpen(true)}
          testID="open-filter"
          variant="secondary"
        >
          Filter
        </Button>
      </View>

      <Sheet
        onClose={() => setFilterOpen(false)}
        open={filterOpen}
        title="Categorie"
      >
        <CategoryFilter
          categories={categories ?? []}
          onChange={handleCategoryChange}
          selected={selectedCategory}
          testID="category-filter"
        />
      </Sheet>

      {error ? (
        <View className="flex-1 items-center justify-center gap-md">
          <Text className="text-danger" testID="gestures-error">
            {LOAD_ERROR}
          </Text>
          <Button onPress={refetch} testID="retry">
            {RETRY_LABEL}
          </Button>
        </View>
      ) : (
        <GestureGrid
          className="flex-1"
          gestures={items}
          loading={loading && items.length === 0}
          onEndReached={handleEndReached}
          renderItem={(gesture) => (
            <GestureCard
              gesture={gesture}
              onPress={(id) => router.push(`/gestures/${id}`)}
            />
          )}
          testID="gestures-list"
        />
      )}
    </View>
  );
}
