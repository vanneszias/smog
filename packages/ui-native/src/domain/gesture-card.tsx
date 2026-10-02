import { useTranslation } from "@smog/i18n/react";
import type { ReactElement } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import { Badge } from "../components/badge";
import { Text } from "../components/text";
import { cn } from "../lib/cn";
import { FavoriteButton } from "./favorite-button";
import { categoryLine, GestureThumbnail } from "./gesture-parts";
import type { GestureCardData } from "./types";

export interface GestureCardProps extends Omit<ViewProps, "children"> {
  className?: string;
  favorite?: boolean;
  gesture: GestureCardData;
  /** Web's heading level; accepted, no effect on native. */
  level?: 2 | 3 | 4;
  /** Shows the heart; called with the next state. */
  onFavoriteToggle?: (favorite: boolean) => void;
  /** Opens the gesture (web: `href`); the card is a button with it. */
  onPress?: () => void;
  /** Shows the `gesture.sponsored` badge. */
  sponsored?: boolean;
}

/** A gesture in a grid: its still (3:4), name and categories, and the heart. */
export function GestureCard({
  className,
  favorite = false,
  gesture,
  level: _level,
  onFavoriteToggle,
  onPress,
  sponsored = false,
  testID,
  ...props
}: GestureCardProps): ReactElement {
  const { t } = useTranslation();
  const categories = categoryLine(gesture.categories);
  const body = (
    <>
      <GestureThumbnail
        className="w-full"
        playbackId={gesture.playbackId}
        testID={testID ? `${testID}-thumbnail` : undefined}
        width={480}
      />
      <View className="gap-0.5 p-3">
        <Text className="text-title-3" numberOfLines={1} weight="semibold">
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
      className={cn(
        "relative overflow-hidden rounded-lg border border-border-subtle bg-surface",
        className
      )}
      testID={testID}
      {...props}
    >
      {onPress ? (
        <Pressable
          accessibilityHint={categories || undefined}
          accessibilityLabel={gesture.name}
          accessibilityRole="button"
          className="active:opacity-80"
          onPress={onPress}
        >
          {body}
        </Pressable>
      ) : (
        <View accessibilityLabel={gesture.name} accessible>
          {body}
        </View>
      )}
      {sponsored ? (
        <Badge
          className="absolute top-2 left-2"
          pointerEvents="none"
          variant="accent"
        >
          {t("gesture.sponsored")}
        </Badge>
      ) : null}
      {onFavoriteToggle ? (
        <FavoriteButton
          active={favorite}
          className="absolute top-2 right-2"
          onToggle={onFavoriteToggle}
          variant="overlay"
        />
      ) : null}
    </View>
  );
}
