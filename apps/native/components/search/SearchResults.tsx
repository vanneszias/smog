import { GestureCard } from "@components/common";
import type { GestureCardRef } from "@components/GestureCard";
import { FlashList } from "@shopify/flash-list";
import type React from "react";
import { useCallback, useRef } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import type { Gesture } from "@/types";

interface SearchResultsProps {
  isLoading?: boolean;
  results: Gesture[];
  initialQuery?: string;
  onGesturePress: (gesture: Gesture) => void;
  isFavorite: (gestureId: string) => boolean;
  onToggleFavorite: (gestureId: string) => void;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isRefreshing?: boolean;
  style?: StyleProp<ViewStyle>;
  onScroll?: (scrollY: number) => void;
  source?: "search_results" | "favorites_screen" | "related_gestures";
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  onGesturePress,
  isFavorite,
  onToggleFavorite,
  onRefresh,
  onLoadMore,
  hasMore,
  isRefreshing = false,
  style,
  onScroll,
  source = "search_results",
}) => {
  const gestureRefs = useRef<(GestureCardRef | null)[]>([]);

  const closeAllGestures = useCallback(() => {
    for (const ref of gestureRefs.current) {
      if (ref) {
        ref.close();
      }
    }
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: Gesture; index: number }) => (
      <GestureCard
        gesture={item}
        isFavorite={isFavorite(item.id)}
        onPress={onGesturePress}
        onToggleFavorite={onToggleFavorite}
        ref={(ref: GestureCardRef | null) => {
          gestureRefs.current[index] = ref;
        }}
        source={source}
      />
    ),
    [isFavorite, onToggleFavorite, onGesturePress, source]
  );

  const handleScrollEvent = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const scrollY = event.nativeEvent.contentOffset.y;
      // Simple, direct scroll position reporting for stable header animation
      onScroll?.(scrollY);
    },
    [onScroll]
  );

  const keyExtractor = useCallback(
    (item: Gesture, index: number) => `${item.id}-${index}`,
    []
  );

  // Create extraData to force re-render when favorites change
  const extraData = results.map((item) => isFavorite(item.id)).join(",");

  // Deduplicate results by gesture ID to prevent duplicate items in the list
  const uniqueResults = results.filter(
    (gesture, index, arr) =>
      arr.findIndex((item) => item.id === gesture.id) === index
  );

  return (
    <View style={[{ flex: 1 }, style]}>
      <FlashList
        data={uniqueResults}
        extraData={extraData}
        keyboardShouldPersistTaps="handled"
        keyExtractor={keyExtractor}
        onEndReached={hasMore ? onLoadMore : null}
        onEndReachedThreshold={0.5}
        onRefresh={onRefresh}
        onScroll={handleScrollEvent}
        onScrollBeginDrag={closeAllGestures}
        refreshing={isRefreshing}
        renderItem={renderItem}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default SearchResults;
