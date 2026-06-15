import GestureCard from "@components/GestureCard";
import { FlashList } from "@shopify/flash-list";
import type React from "react";
import { useCallback, useMemo } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import type { Gesture } from "@/types";

// Special marker for header item
type ListItem = Gesture | { __isHeader: true };

interface SearchResultsProps {
  isLoading?: boolean;
  results: Gesture[];
  initialQuery?: string;
  onGesturePress: (gesture: Gesture) => void;
  isSaved: (gestureId: string) => boolean;
  onOpenListPicker: (gesture: Gesture) => void;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isRefreshing?: boolean;
  style?: StyleProp<ViewStyle>;
  onScroll?: (scrollY: number) => void;
  ListHeaderComponent?: React.ReactElement | null;
}

const isHeaderItem = (item: ListItem): item is { __isHeader: true } => {
  return "__isHeader" in item;
};

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onGesturePress,
  isSaved,
  onOpenListPicker,
  onRefresh,
  onLoadMore,
  hasMore,
  isRefreshing = false,
  style,
  onScroll,
  ListHeaderComponent,
}) => {
  // Prepend header item to data for sticky header support
  const data = useMemo(() => {
    // Deduplicate results by gesture ID
    const uniqueResults = results.filter(
      (gesture, index, arr) =>
        arr.findIndex((item) => item.id === gesture.id) === index
    );

    if (ListHeaderComponent) {
      return [{ __isHeader: true }, ...uniqueResults] as ListItem[];
    }
    return uniqueResults as ListItem[];
  }, [results, ListHeaderComponent]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      // Handle header item
      if (isHeaderItem(item)) {
        return ListHeaderComponent as React.ReactElement;
      }

      return (
        <GestureCard
          gesture={item}
          isSaved={isSaved(item.id)}
          onOpenListPicker={onOpenListPicker}
          onPress={onGesturePress}
        />
      );
    },
    [isSaved, onOpenListPicker, onGesturePress, ListHeaderComponent]
  );

  const handleScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      onScroll?.(scrollY);
    },
    [onScroll]
  );

  const keyExtractor = useCallback((item: ListItem, index: number) => {
    if (isHeaderItem(item)) {
      return "header";
    }
    return `${item.id}-${index}`;
  }, []);

  // Force rows to refresh when their saved state changes.
  const extraData = results.map((item) => isSaved(item.id)).join(",");

  return (
    <View style={[{ flex: 1 }, style]}>
      <FlashList
        contentInsetAdjustmentBehavior={
          Platform.OS === "ios" ? "automatic" : undefined
        }
        data={data}
        extraData={extraData}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={keyExtractor}
        onEndReached={hasMore ? onLoadMore : null}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        onScroll={handleScrollEvent}
        refreshing={isRefreshing}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={ListHeaderComponent ? [0] : undefined}
      />
    </View>
  );
};

export default SearchResults;
