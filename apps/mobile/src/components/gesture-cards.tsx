import type {
  CollectionSource,
  GestureViewSource,
} from "@smog/analytics/schema";
import { useFavorites } from "@smog/favorites/client";
import { useTranslation } from "@smog/i18n/react";
import {
  GestureCard,
  type GestureCardData,
  GestureRow,
  useToast,
} from "@smog/ui-native";
import { useRouter } from "expo-router";
import { type ReactElement, type ReactNode, useCallback } from "react";

/**
 * Opens a gesture on the gesture screen (the root stack's card). `from`
 * is where it was opened, for `gesture_viewed` (a deep link has none and
 * counts as `direct`).
 */
export function useOpenGesture(
  from: GestureViewSource = "direct"
): (slug: string) => void {
  const router = useRouter();
  return useCallback(
    (slug: string) => {
      router.push({ params: { from, slug }, pathname: "/gestures/[slug]" });
    },
    [from, router]
  );
}

/**
 * The heart of a gesture: flips at once (optimistic for accounts, on the
 * device for guests); a failed flip is rolled back by the hook and toasted.
 */
export function useToggleFavorite(source: CollectionSource = "gesture_list"): {
  isFavorite: (gestureId: string) => boolean;
  toggle: (gestureId: string) => void;
} {
  const { t } = useTranslation();
  const { toast } = useToast();
  const favorites = useFavorites({ items: false, source });
  const { toggle: flip } = favorites;
  const toggle = useCallback(
    (gestureId: string) => {
      flip(gestureId).catch((error: unknown) => {
        console.error("[favorites] Failed to toggle:", error);
        toast({ title: t("states.actionFailed"), variant: "danger" });
      });
    },
    [flip, t, toast]
  );
  return { isFavorite: favorites.isFavorite, toggle };
}

interface BoundProps {
  favorite: boolean;
  gesture: GestureCardData;
  onFavorite: (gestureId: string) => void;
  onOpen: (slug: string) => void;
}

/** The handlers of one card or row, bound to its gesture. */
function useBound({ gesture, onFavorite, onOpen }: BoundProps): {
  favorite: () => void;
  open: () => void;
} {
  const { id, slug } = gesture;
  const favorite = useCallback(() => onFavorite(id), [id, onFavorite]);
  const open = useCallback(() => onOpen(slug), [onOpen, slug]);
  return { favorite, open };
}

/** A GestureCard that opens the gesture, with its heart. */
function GestureCardItem(props: BoundProps): ReactElement {
  const bound = useBound(props);
  return (
    <GestureCard
      favorite={props.favorite}
      gesture={props.gesture}
      onFavoriteToggle={bound.favorite}
      onPress={bound.open}
    />
  );
}

/** A GestureRow that opens the gesture, with its heart and the row slots. */
export function GestureRowItem({
  className,
  dragHandle,
  trailing,
  ...props
}: BoundProps & {
  className?: string;
  dragHandle?: ReactNode;
  trailing?: ReactNode;
}): ReactElement {
  const bound = useBound(props);
  return (
    <GestureRow
      className={className}
      dragHandle={dragHandle}
      favorite={props.favorite}
      gesture={props.gesture}
      onFavoriteToggle={bound.favorite}
      onPress={bound.open}
      trailing={trailing}
    />
  );
}

/**
 * `renderItem` for a GestureGrid or SearchResults: a card that opens the
 * gesture, with its heart. `from` is the screen, for analytics.
 */
export function useGestureCardRenderer<T extends GestureCardData>(
  from: GestureViewSource = "direct"
): (item: T) => ReactElement {
  const open = useOpenGesture(from);
  const { isFavorite, toggle } = useToggleFavorite(
    from === "search_results" ? "search_results" : "gesture_list"
  );
  return useCallback(
    (item: T) => (
      <GestureCardItem
        favorite={isFavorite(item.id)}
        gesture={item}
        onFavorite={toggle}
        onOpen={open}
      />
    ),
    [isFavorite, open, toggle]
  );
}
