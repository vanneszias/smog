import type { ReactElement, ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { Text } from "../components/text";
import { cn } from "../lib/cn";
import { FavoriteButton } from "./favorite-button";
import { categoryLine, GestureThumbnail } from "./gesture-parts";
import type { GestureCardData } from "./types";

export interface GestureRowProps extends Omit<ViewProps, "children"> {
  className?: string;
  /** A leading slot for a list's drag handle. */
  dragHandle?: ReactNode;
  favorite?: boolean;
  gesture: GestureCardData;
  onFavoriteToggle?: (favorite: boolean) => void;
  /** Opens the gesture (web: `href`). */
  onPress?: () => void;
  /** A trailing slot before the heart (a row menu). */
  trailing?: ReactNode;
}

/** The dense list variant of GestureCard. The slots and the heart are siblings of the row button. */
export function GestureRow({
  className,
  dragHandle,
  favorite = false,
  gesture,
  onFavoriteToggle,
  onPress,
  trailing,
  ...props
}: GestureRowProps): ReactElement {
  const categories = categoryLine(gesture.categories);
  const body = (
    <>
      <GestureThumbnail
        className="h-12 rounded-sm"
        playbackId={gesture.playbackId}
        width={96}
      />
      <View className="flex-1">
        <Text numberOfLines={1} weight="medium">
          {gesture.name}
        </Text>
        {categories ? (
          <Text numberOfLines={1} size="body-sm" tone="muted">
            {categories}
          </Text>
        ) : null}
      </View>
    </>
  );
  return (
    <View
      className={cn("min-h-touch flex-row items-center gap-3 py-2", className)}
      {...props}
    >
      {dragHandle}
      {onPress ? (
        <Pressable
          accessibilityHint={categories || undefined}
          accessibilityLabel={gesture.name}
          accessibilityRole="button"
          className="min-h-touch flex-1 flex-row items-center gap-3 rounded-md active:bg-surface-sunken"
          onPress={onPress}
        >
          {body}
        </Pressable>
      ) : (
        <View
          accessibilityLabel={gesture.name}
          accessible
          className="flex-1 flex-row items-center gap-3"
        >
          {body}
        </View>
      )}
      {trailing}
      {onFavoriteToggle ? (
        <FavoriteButton active={favorite} onToggle={onFavoriteToggle} />
      ) : null}
    </View>
  );
}
