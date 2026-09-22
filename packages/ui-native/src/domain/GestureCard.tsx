import { Pressable, View, type ViewProps } from "react-native";
import { Badge } from "../components/Badge";
import { cardVariants } from "../components/Card";
import { Text } from "../components/Text";
import { cn } from "../lib/cn";

/**
 * A gesture as a card needs it: already loaded, already flattened.
 *
 * The same shape `packages/ui-web/src/domain/GestureCard.tsx` declares,
 * redeclared here rather than imported: importing the web module would pull
 * `@mux/mux-player-react` and React DOM into a React Native bundle through
 * `GestureGrid.tsx`'s own web import chain. `summary.test.ts` compares the
 * two declarations as text so the two cannot drift silently.
 *
 * `categories` is last for the same reason it is last on web: the parity
 * test slices this interface's source up to its first `}`, and this field's
 * own inline object type closes with one before the interface does. See
 * that test's comment, and the matching note on the web declaration.
 */
export interface GestureSummary {
  id: string;
  name: string;
  playbackId?: string | null;
  categories?: readonly { id: string; name: string }[];
}

export type GestureCardProps = Omit<ViewProps, "children"> & {
  gesture: GestureSummary;
  /**
   * Replaces web's `renderLink`: a phone has no anchor to wrap, and this
   * package must not import a router any more than the web one does.
   * Present, this makes the whole card a `role="button"`; absent, the card
   * is a plain, unpressable surface.
   */
  onPress?: (id: string) => void;
  /** Renders the favourite control. Without it there is nothing to press. */
  onFavorite?: (id: string) => void;
  isFavorite?: boolean;
  favoriteLabel?: string;
  className?: string;
};

/**
 * One gesture in a list.
 *
 * The favourite control keeps **one** accessible name in both states and
 * reports the state through `accessibilityState.selected` on a
 * `role="button"` — the property both VoiceOver and TalkBack actually
 * announce. Relabelling the control between "add" and "remove" instead
 * reads as a different control each time it is pressed; see
 * `GestureCard.test.tsx` for the test this guards.
 */
export function GestureCard({
  className,
  favoriteLabel = "Favoriet",
  gesture,
  isFavorite = false,
  onFavorite,
  onPress,
  testID = "root",
  ...props
}: GestureCardProps) {
  const categories = gesture.categories ?? [];
  const isPressable = onPress != null;

  const body = (
    <View className="flex-row items-start gap-sm p-md">
      <View className="min-w-0 flex-1">
        <Text className="font-semibold text-md" numberOfLines={1}>
          {gesture.name}
        </Text>
        {categories.length === 0 ? null : (
          <View className="mt-sm flex-row flex-wrap gap-xs">
            {categories.map((category) => (
              <Badge key={category.id} size="sm">
                {category.name}
              </Badge>
            ))}
          </View>
        )}
      </View>
      {onFavorite == null ? null : (
        <Pressable
          accessibilityLabel={favoriteLabel}
          accessibilityRole="button"
          accessibilityState={{ selected: isFavorite }}
          className="shrink-0"
          onPress={() => onFavorite(gesture.id)}
          testID={`${testID}-favorite`}
        >
          <Text
            className={isFavorite ? "text-primary" : "text-foreground-muted"}
          >
            {isFavorite ? "♥" : "♡"}
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (isPressable) {
    return (
      <Pressable
        accessibilityRole="button"
        className={cn(cardVariants({ interactive: true }), className)}
        onPress={() => onPress(gesture.id)}
        testID={testID}
        {...props}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      className={cn(cardVariants({ interactive: false }), className)}
      testID={testID}
      {...props}
    >
      {body}
    </View>
  );
}
