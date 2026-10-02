import { tokens } from "@smog/styles/tokens";
import { type ReactElement, type ReactNode, useCallback, useMemo } from "react";
import {
  FlatList,
  type FlatListProps,
  type ListRenderItemInfo,
  View,
} from "react-native";
import { GestureCard } from "./gesture-card";
import type { GestureCardData } from "./types";

const GAP = tokens.spacing["3"];
const COLUMN_STYLE = { gap: GAP } as const;
const CONTENT_STYLE = { gap: GAP } as const;

export interface GestureGridProps<T extends GestureCardData>
  extends Omit<
    FlatListProps<T | null>,
    "data" | "renderItem" | "numColumns" | "keyExtractor"
  > {
  items: readonly T[];
  /** Columns (2 by default; a tablet screen may pass more). */
  numColumns?: number;
  /** Renders one gesture (a GestureCard without press or heart by default). */
  renderItem?: (item: T, index: number) => ReactNode;
}

/**
 * Gesture cards in a virtualised grid (FlatList). The last row is padded
 * with empty cells so every card keeps the column width. Pass
 * `scrollEnabled={false}` inside another vertical ScrollView.
 */
export function GestureGrid<T extends GestureCardData>({
  items,
  numColumns = 2,
  renderItem,
  testID,
  ...props
}: GestureGridProps<T>): ReactElement {
  const data = useMemo((): (T | null)[] => {
    const remainder = items.length % numColumns;
    const filler = remainder === 0 ? 0 : numColumns - remainder;
    return [...items, ...Array.from({ length: filler }, () => null)];
  }, [items, numColumns]);
  const keyOf = useCallback(
    (item: T | null, index: number): string => item?.id ?? `filler-${index}`,
    []
  );
  const renderCell = useCallback(
    ({ index, item }: ListRenderItemInfo<T | null>): ReactElement => {
      if (!item) {
        return (
          <View className="flex-1" testID={`${testID ?? "grid"}-filler`} />
        );
      }
      return (
        <View className="flex-1">
          {renderItem ? (
            renderItem(item, index)
          ) : (
            <GestureCard gesture={item} />
          )}
        </View>
      );
    },
    [renderItem, testID]
  );
  return (
    <FlatList
      columnWrapperStyle={numColumns > 1 ? COLUMN_STYLE : undefined}
      contentContainerStyle={CONTENT_STYLE}
      data={data}
      // A new column count needs a new list (FlatList cannot change it live).
      key={numColumns}
      keyExtractor={keyOf}
      numColumns={numColumns}
      renderItem={renderCell}
      testID={testID}
      {...props}
    />
  );
}
